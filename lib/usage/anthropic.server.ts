import { ApiUsageSnapshot } from '@/types/api';

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
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchAnthropicUsage(adminKey: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();
  const startingAt = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const usage = await anthropicGet<AnthropicUsagePage>(
    `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${encodeURIComponent(startingAt)}&bucket_width=1d&limit=7`,
    adminKey
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
    // El reporte de uso de Anthropic no incluye nº de peticiones ni saldo.
    unavailable: ['balance', 'requestCount'],
  };

  try {
    const costs = await anthropicGet<AnthropicCostPage>(
      `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(startingAt)}&bucket_width=1d&limit=7`,
      adminKey
    );
    let accumulatedCostCents = 0;
    for (const bucket of costs.data ?? []) {
      for (const result of bucket.results ?? []) {
        accumulatedCostCents += Number(result.amount ?? 0);
      }
    }
    // El importe viene en centesimas de la moneda (centavos), como string decimal.
    snapshot.accumulatedCost = accumulatedCostCents / 100;
    snapshot.currency = 'USD';
  } catch {
    snapshot.unavailable = [...(snapshot.unavailable ?? []), 'accumulatedCost'];
  }

  return snapshot;
}
