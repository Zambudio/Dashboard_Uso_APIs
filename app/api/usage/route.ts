import { NextRequest, NextResponse } from 'next/server';
import { ApiUsageSnapshot, ProviderKey } from '@/types/api';
import { readDashboardState, readEnvKeys } from '@/lib/env-keys.server';
import { getProviderDefinition } from '@/lib/providers';
import { fetchDeepSeekUsage } from '@/lib/usage/deepseek.server';
import { fetchOpenAIUsage } from '@/lib/usage/openai.server';
import { fetchAnthropicUsage } from '@/lib/usage/anthropic.server';
import { fetchClaudeProUsage } from '@/lib/usage/claude-pro.server';
import { fetchGeminiUsage } from '@/lib/usage/gemini.server';
import { fetchAntigravityUsage } from '@/lib/usage/antigravity.server';
import { getSyncedSnapshot, saveSyncedSnapshot } from '@/lib/synced-cache.server';

import { fetchClaudeOAuthUsage } from '@/lib/usage/claude-oauth.server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { id?: string; provider?: ProviderKey };
  try {
    body = (await request.json()) as { id?: string; provider?: ProviderKey };
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const { id, provider } = body;
  if (!id || !provider) {
    return NextResponse.json({ error: 'missing id or provider' }, { status: 400 });
  }

  const definition = getProviderDefinition(provider);
  if (!definition.usageImplemented) {
    return NextResponse.json(
      { error: `La consulta de uso todavía no está implementada para ${definition.label}.` },
      { status: 501 }
    );
  }

  const state = await readDashboardState<{ providers?: Array<{ id: string; provider: ProviderKey }> }>();
  const isClaudeFamily = (p?: string) => p === 'claude-pro' || p === 'anthropic';
  const configuredProvider = state.providers?.find(
    (item) =>
      item.id === id ||
      item.provider === provider ||
      (isClaudeFamily(provider) && isClaudeFamily(item.provider))
  );
  if (!configuredProvider) {
    return NextResponse.json(
      { error: 'La integración solicitada no existe o no coincide con el proveedor.' },
      { status: 400 }
    );
  }

  const cached = getSyncedSnapshot(id) || (provider ? getSyncedSnapshot(provider) : null);

  // Si es Gemini, intentar siempre consultar el Language Server local de Antigravity en tiempo real
  if (provider === 'gemini') {
    try {
      const antigravitySnapshot = await fetchAntigravityUsage('gemini');
      if (antigravitySnapshot) {
        saveSyncedSnapshot(id, provider, antigravitySnapshot);
        return NextResponse.json(antigravitySnapshot);
      }
    } catch (err) {
      console.warn('[usage-route] Antigravity auto-fetch warning:', err);
    }
    if (cached?.snapshot?.planType?.includes('Antigravity') || cached?.snapshot?.planType?.includes('Google AI')) {
      return NextResponse.json(cached.snapshot);
    }
  }

  const keys = await readEnvKeys();
  const secret = keys[id] || (provider ? keys[provider] : undefined);

  // Si no hay clave guardada, intentar detección local directa de suscripciones
  if (!secret) {
    if (provider === 'claude-pro' || provider === 'anthropic') {
      try {
        const snap = await fetchClaudeOAuthUsage();
        if (snap) {
          saveSyncedSnapshot(id, provider, snap);
          return NextResponse.json(snap);
        }
      } catch {}
    } else if (provider === 'openai') {
      try {
        const snap = await fetchOpenAIUsage('');
        if (snap) {
          saveSyncedSnapshot(id, provider, snap);
          return NextResponse.json(snap);
        }
      } catch {}
    }

    // Intentar Language Server si está activo para Claude o GPT
    try {
      const antigravitySnapshot = await fetchAntigravityUsage(provider);
      if (antigravitySnapshot) {
        saveSyncedSnapshot(id, provider, antigravitySnapshot);
        return NextResponse.json(antigravitySnapshot);
      }
    } catch {
      // continuar
    }

    if (cached?.snapshot) {
      return NextResponse.json(cached.snapshot);
    }
    return NextResponse.json(
      { error: 'No hay clave guardada ni suscripción local detectada para este proveedor.' },
      { status: 400 }
    );
  }

  try {
    let snapshot: ApiUsageSnapshot;
    switch (provider) {
      case 'deepseek':
        snapshot = await fetchDeepSeekUsage(secret, id);
        break;
      case 'openai':
        snapshot = await fetchOpenAIUsage(secret);
        break;
      case 'anthropic':
        snapshot = await fetchAnthropicUsage(secret);
        break;
      case 'claude-pro':
        snapshot = await fetchClaudeProUsage(secret);
        break;
      case 'gemini':
        snapshot = await fetchGeminiUsage(secret);
        break;
      default:
        return NextResponse.json({ error: `Proveedor no soportado: ${provider}` }, { status: 400 });
    }
    return NextResponse.json(snapshot);
  } catch (error) {
    // Si la llamada falló pero podemos recurrir a suscripciones locales
    if (provider === 'claude-pro' || provider === 'anthropic') {
      try {
        const fallbackSnap = await fetchClaudeOAuthUsage();
        if (fallbackSnap) {
          saveSyncedSnapshot(id, provider, fallbackSnap);
          return NextResponse.json(fallbackSnap);
        }
      } catch {}
    } else if (provider === 'openai') {
      try {
        const fallbackSnap = await fetchOpenAIUsage('');
        if (fallbackSnap) {
          saveSyncedSnapshot(id, provider, fallbackSnap);
          return NextResponse.json(fallbackSnap);
        }
      } catch {}
    }

    if (cached?.snapshot) {
      return NextResponse.json(cached.snapshot);
    }

    const message = error instanceof Error ? error.message : 'Error desconocido consultando el proveedor.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
