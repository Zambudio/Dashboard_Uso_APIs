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
  const configuredProvider = state.providers?.find((item) => item.id === id);
  if (!configuredProvider || configuredProvider.provider !== provider) {
    return NextResponse.json(
      { error: 'La integraciÃ³n solicitada no existe o no coincide con el proveedor.' },
      { status: 400 }
    );
  }

  const cached = getSyncedSnapshot(id) || (provider ? getSyncedSnapshot(provider) : null);

  // Si es Gemini, intentar siempre consultar el Language Server local de Antigravity en tiempo real
  if (provider === 'gemini') {
    try {
      const antigravitySnapshot = await fetchAntigravityUsage();
      if (antigravitySnapshot) {
        saveSyncedSnapshot(id, provider, antigravitySnapshot);
        return NextResponse.json(antigravitySnapshot);
      }
    } catch (err) {
      console.warn('[usage-route] Antigravity auto-fetch warning:', err);
    }
    if (cached?.snapshot?.planType?.includes('Antigravity')) {
      return NextResponse.json(cached.snapshot);
    }
  }

  const keys = await readEnvKeys();
  const secret = keys[id] || (provider ? keys[provider] : undefined);
  if (!secret) {
    if (cached?.snapshot) {
      return NextResponse.json(cached.snapshot);
    }
    return NextResponse.json({ error: 'No hay clave/cookie guardada ni datos sincronizados para este proveedor.' }, { status: 400 });
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
    if (cached?.snapshot) {
      return NextResponse.json(cached.snapshot);
    }
    const message = error instanceof Error ? error.message : 'Error desconocido consultando el proveedor.';
    if (
      message.includes('browserType.launch') ||
      message.includes('msedge') ||
      message.includes('Chromium') ||
      message.includes('Executable')
    ) {
      return NextResponse.json(
        { error: 'Sincroniza tus datos de uso pulsando el botón ⚡ Sincronizar Navegador de arriba.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
