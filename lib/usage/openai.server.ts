import { ApiUsageSnapshot } from '@/types/api';

interface OpenAIUsageResult {
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  num_model_requests?: number;
}

interface OpenAIUsageBucket {
  start_time: number;
  end_time: number;
  results: OpenAIUsageResult[];
}

interface OpenAIUsagePage {
  data: OpenAIUsageBucket[];
  has_more?: boolean;
  next_page?: string | null;
}

interface OpenAICostAmount {
  value: number;
  currency: string;
}

interface OpenAICostResult {
  amount?: OpenAICostAmount;
}

interface OpenAICostBucket {
  results: OpenAICostResult[];
}

interface OpenAICostPage {
  data: OpenAICostBucket[];
}

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

async function openaiGet<T>(url: string, adminKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI API ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchOpenAIUsage(adminKey: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();
  const startTime = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS;

  const usage = await openaiGet<OpenAIUsagePage>(
    `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&bucket_width=1d&limit=7`,
    adminKey
  );

  let tokensUsed = 0;
  let requestCount = 0;
  for (const bucket of usage.data ?? []) {
    for (const result of bucket.results ?? []) {
      tokensUsed += (result.input_tokens ?? 0) + (result.output_tokens ?? 0);
      requestCount += result.num_model_requests ?? 0;
    }
  }

  const snapshot: ApiUsageSnapshot = {
    fetchedAt,
    tokensUsed,
    requestCount,
    unavailable: ['balance'],
  };

  try {
    const costs = await openaiGet<OpenAICostPage>(
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&bucket_width=1d&limit=7`,
      adminKey
    );
    let accumulatedCost = 0;
    let currency = 'usd';
    for (const bucket of costs.data ?? []) {
      for (const result of bucket.results ?? []) {
        if (result.amount) {
          accumulatedCost += result.amount.value;
          currency = result.amount.currency;
        }
      }
    }
    snapshot.accumulatedCost = accumulatedCost;
    snapshot.currency = currency.toUpperCase();
  } catch {
    snapshot.unavailable = [...(snapshot.unavailable ?? []), 'accumulatedCost'];
  }

  return snapshot;
}
