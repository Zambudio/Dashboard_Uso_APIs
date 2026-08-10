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

interface OpenAIDashboardCreditGrants {
  total_granted?: number;
  total_used?: number;
  total_available?: number;
  grants?: { data?: { grant_amount?: number; used_amount?: number; expires_at?: number }[] };
}

interface OpenAIDashboardSubscription {
  plan?: { title?: string; id?: string };
  hard_limit_usd?: number;
  soft_limit_usd?: number;
  has_payment_method?: boolean;
  account_name?: string;
}

interface OpenAIDashboardDailyCost {
  timestamp?: number;
  line_items?: { name?: string; cost?: number }[];
}

interface OpenAIDashboardUsage {
  total_usage?: number;
  daily_costs?: OpenAIDashboardDailyCost[];
}

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

async function openaiGet<T>(url: string, token: string, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    ...extraHeaders,
  };

  const res = await fetch(url, {
    headers,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 403 && (text.includes('Missing scopes') || text.includes('api.usage.read') || token.startsWith('sk-proj-'))) {
      throw new Error(
        'Permisos insuficientes (403): La clave actual es una Project API Key (sk-proj-...). Para ver costes y uso de tokens se necesita una Admin API Key (sk-admin-...) con permisos "api.usage.read" y "api.costs.read" desde platform.openai.com/settings/organization/admin-keys, o usar "Iniciar sesión web".'
      );
    }
    if (res.status === 401) {
      throw new Error('Clave de OpenAI no válida o expirada (401). Verifica tu clave en platform.openai.com.');
    }
    throw new Error(`OpenAI API ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchOpenAIUsage(secret: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();
  let token = secret.trim();
  let sessionCookie = '';
  let organizationId = '';

  // Check if JSON stored from browser session
  if (token.startsWith('{')) {
    try {
      const parsed = JSON.parse(token);
      if (parsed.cachedSnapshot && typeof parsed.cachedSnapshot.weeklyUtilization === 'number') {
        return {
          ...parsed.cachedSnapshot,
          fetchedAt,
        };
      }
      if (parsed.accessToken) token = parsed.accessToken;
      else if (parsed.sessionToken) token = parsed.sessionToken;
      else if (parsed.apiKey) token = parsed.apiKey;
      if (parsed.organizationId) organizationId = parsed.organizationId;
      if (parsed.cookie) sessionCookie = parsed.cookie;
    } catch {
      // ignore
    }
  }

  const customHeaders: Record<string, string> = {};
  if (organizationId) {
    customHeaders['OpenAI-Organization'] = organizationId;
  }
  if (sessionCookie) {
    customHeaders['Cookie'] = sessionCookie;
  }

  // Session Token / Browser session flow
  const isSessionToken = token.startsWith('sess-') || Boolean(sessionCookie) || token.startsWith('eyJ');

  if (isSessionToken) {
    // 1. Try ChatGPT subscription limits (wham/usage)
    try {
      const whamRes = await fetch('https://chatgpt.com/backend-api/wham/usage', {
        headers: {
          Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          ...(sessionCookie ? { Cookie: sessionCookie } : {}),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        cache: 'no-store',
      });

      if (whamRes.ok) {
        const wham = await whamRes.json();
        const weeklyUtil = wham.rate_limit?.primary_window?.used_percent ?? 0;
        const resetAtSeconds = wham.rate_limit?.primary_window?.reset_at;
        const weeklyResetsAt = resetAtSeconds ? new Date(resetAtSeconds * 1000).toISOString() : undefined;
        const planName = wham.plan_type ? `ChatGPT ${wham.plan_type.charAt(0).toUpperCase() + wham.plan_type.slice(1)}` : 'ChatGPT Plus';

        return {
          fetchedAt,
          weeklyUtilization: weeklyUtil,
          weeklyResetsAt,
          planType: planName,
          unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'],
        };
      }
    } catch {
      // ignore
    }

    const startTime = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS;
    let accumulatedCost: number | undefined;
    let currency = 'USD';
    let tokensUsed: number | undefined;
    let requestCount: number | undefined;
    let planType = 'OpenAI Platform';

    // Try modern organization costs
    try {
      const costs = await openaiGet<OpenAICostPage>(
        `https://api.openai.com/v1/organization/costs?start_time=${startTime}&bucket_width=1d&limit=7`,
        token,
        customHeaders
      );
      if (costs.data) {
        let total = 0;
        for (const bucket of costs.data) {
          for (const result of bucket.results ?? []) {
            if (result.amount) {
              total += result.amount.value ?? 0;
              if (result.amount.currency) currency = result.amount.currency.toUpperCase();
            }
          }
        }
        accumulatedCost = total;
      }
    } catch {
      // ignore
    }

    // Try completions usage
    try {
      const usage = await openaiGet<OpenAIUsagePage>(
        `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&bucket_width=1d&limit=7`,
        token,
        customHeaders
      );
      if (usage.data) {
        let totalTokens = 0;
        let totalRequests = 0;
        for (const bucket of usage.data) {
          for (const result of bucket.results ?? []) {
            totalTokens += (result.input_tokens ?? 0) + (result.output_tokens ?? 0);
            totalRequests += result.num_model_requests ?? 0;
          }
        }
        tokensUsed = totalTokens;
        requestCount = totalRequests;
      }
    } catch {
      // ignore
    }

    return {
      fetchedAt,
      accumulatedCost,
      currency,
      tokensUsed,
      requestCount,
      planType,
      unavailable: [
        'balance',
        ...(accumulatedCost === undefined ? ['accumulatedCost'] : []),
        ...(tokensUsed === undefined ? ['tokensUsed'] : []),
        ...(requestCount === undefined ? ['requestCount'] : []),
      ],
    };
  }

  // Standard Admin API key flow
  const startTime = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS;

  const usage = await openaiGet<OpenAIUsagePage>(
    `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&bucket_width=1d&limit=7`,
    token,
    customHeaders
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
    planType: token.startsWith('sk-admin') ? 'OpenAI API (Admin)' : 'OpenAI API',
    unavailable: ['balance'],
  };

  try {
    const costs = await openaiGet<OpenAICostPage>(
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&bucket_width=1d&limit=7`,
      token,
      customHeaders
    );
    let accumulatedCost = 0;
    let currency = 'USD';
    for (const bucket of costs.data ?? []) {
      for (const result of bucket.results ?? []) {
        if (result.amount) {
          accumulatedCost += result.amount.value;
          if (result.amount.currency) currency = result.amount.currency.toUpperCase();
        }
      }
    }
    snapshot.accumulatedCost = accumulatedCost;
    snapshot.currency = currency;
  } catch {
    snapshot.unavailable = [...(snapshot.unavailable ?? []), 'accumulatedCost'];
  }

  return snapshot;
}
