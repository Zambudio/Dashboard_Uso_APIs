import { ApiUsageSnapshot } from '@/types/api';
import { fetchClaudeProUsage } from './claude-pro.server';

interface AnthropicUsageResult {
  uncached_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number;
    ephemeral_5m_input_tokens?: number;
  };
  output_tokens?: number;
}

interface AnthropicUsageBucket {
  starting_at: string;
  ending_at: string;
  results: AnthropicUsageResult[];
}

interface AnthropicUsagePage {
  data: AnthropicUsageBucket[];
}

interface AnthropicCostResult {
  amount?: string;
  currency?: string;
}

interface AnthropicCostBucket {
  results: AnthropicCostResult[];
}

interface AnthropicCostPage {
  data: AnthropicCostBucket[];
}

const ANTHROPIC_VERSION = '2023-06-01';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function anthropicGet<T>(url: string, adminKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'x-api-key': adminKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      if (adminKey.startsWith('sk-ant-api')) {
        throw new Error(
          'Clave sin permisos de administración (401/403): La clave introducida es una API Key estándar (sk-ant-api...). Para consultar métricas de uso y costes de Anthropic se requiere una Admin API Key (sk-ant-admin01-...) desde console.anthropic.com/settings/admin-keys, o usar "Iniciar sesión web".'
        );
      }
      throw new Error(
        'Error de autenticación en Anthropic (401/403): La API de informes requiere una Admin API Key válida (sk-ant-admin01-...) desde console.anthropic.com/settings/admin-keys.'
      );
    }
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchAnthropicUsage(adminKey: string): Promise<ApiUsageSnapshot> {
  const cleanKey = adminKey.trim();

  // If the secret is actually a Claude.ai web session cookie (starts with sk-ant-sid)
  if (cleanKey.startsWith('sk-ant-sid')) {
    return await fetchClaudeProUsage(cleanKey);
  }

  // If JSON session from browser login
  if (cleanKey.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleanKey);
      if (parsed.sessionKey && typeof parsed.sessionKey === 'string' && parsed.sessionKey.startsWith('sk-ant-sid')) {
        return await fetchClaudeProUsage(parsed.sessionKey);
      }
      if (parsed.apiKey && typeof parsed.apiKey === 'string') {
        return await fetchAnthropicUsage(parsed.apiKey);
      }
    } catch {
      // continue
    }
  }

  const fetchedAt = new Date().toISOString();
  const startingAt = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const usage = await anthropicGet<AnthropicUsagePage>(
    `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${encodeURIComponent(startingAt)}&bucket_width=1d&limit=7`,
    cleanKey
  );

  let tokensUsed = 0;
  for (const bucket of usage.data ?? []) {
    for (const result of bucket.results ?? []) {
      tokensUsed +=
        (result.uncached_input_tokens ?? 0) +
        (result.cache_read_input_tokens ?? 0) +
        (result.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
        (result.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
        (result.output_tokens ?? 0);
    }
  }

  const snapshot: ApiUsageSnapshot = {
    fetchedAt,
    tokensUsed,
    planType: 'Anthropic API (Admin)',
    unavailable: ['balance', 'requestCount'],
  };

  try {
    const costs = await anthropicGet<AnthropicCostPage>(
      `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(startingAt)}&bucket_width=1d&limit=7`,
      cleanKey
    );
    let accumulatedCost = 0;
    for (const bucket of costs.data ?? []) {
      for (const result of bucket.results ?? []) {
        accumulatedCost += Number(result.amount ?? 0);
      }
    }
    // El importe viene como string decimal en la divisa (p.ej. "0.84" = $0.84), no en centavos.
    snapshot.accumulatedCost = accumulatedCost;
    snapshot.currency = 'USD';
  } catch {
    snapshot.unavailable = [...(snapshot.unavailable ?? []), 'accumulatedCost'];
  }

  return snapshot;
}
