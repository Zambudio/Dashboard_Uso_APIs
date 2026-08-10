import { NextRequest, NextResponse } from 'next/server';
import { ApiUsageSnapshot, ProviderKey } from '@/types/api';
import { readEnvKeys } from '@/lib/env-keys.server';
import { getProviderDefinition } from '@/lib/providers';
import { fetchDeepSeekUsage } from '@/lib/usage/deepseek.server';
import { fetchOpenAIUsage } from '@/lib/usage/openai.server';
import { fetchAnthropicUsage } from '@/lib/usage/anthropic.server';
import { fetchClaudeProUsage } from '@/lib/usage/claude-pro.server';
import { fetchGeminiUsage } from '@/lib/usage/gemini.server';

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
    return NextResponse.json({ error: `La consulta de uso todavía no está implementada para ${definition.label}.` }, { status: 501 });
  }

  const keys = readEnvKeys();
  const secret = keys[id];
  if (!secret) {
    return NextResponse.json({ error: 'No hay clave/cookie guardada para este proveedor.' }, { status: 400 });
  }

  try {
    let snapshot: ApiUsageSnapshot;
    switch (provider) {
      case 'deepseek':
        snapshot = await fetchDeepSeekUsage(secret);
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
    const message = error instanceof Error ? error.message : 'Error desconocido consultando el proveedor.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
