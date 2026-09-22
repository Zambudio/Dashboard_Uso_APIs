import { ApiUsageSnapshot } from '@/types/api';
import { getLocalCodexCredentials } from '@/lib/local-subscriptions.server';

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
    if (
      res.status === 403 &&
      (text.includes('Missing scopes') || text.includes('api.usage.read') || token.startsWith('sk-proj-'))
    ) {
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

/**
 * El flujo de sesión web (browser login) nunca intentaba leer el saldo —
 * solo uso/coste — así que la tarjeta lo marcaba como "no disponible" pase
 * lo que pase. Con la cookie/token de sesión real (no una API key de
 * proyecto) sí tiene sentido intentar el endpoint clásico de créditos.
 */
async function tryFetchBalance(
  token: string,
  customHeaders: Record<string, string>
): Promise<{ balance?: number; currency?: string }> {
  try {
    const grants = await openaiGet<OpenAIDashboardCreditGrants>(
      'https://api.openai.com/dashboard/billing/credit_grants',
      token,
      customHeaders
    );
    if (typeof grants.total_available === 'number') {
      return { balance: grants.total_available, currency: 'USD' };
    }
  } catch {
    // El caller marca 'balance' como no disponible.
  }
  return {};
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

  // Si no hay token o es sesión vacía, intentar credenciales locales de Codex (~/.codex/auth.json)
  if (!token || token === '{}') {
    const localCodex = getLocalCodexCredentials();
    if (localCodex?.accessToken) {
      token = localCodex.accessToken;
      if (localCodex.accountId) organizationId = localCodex.accountId;
    }
  }

  const customHeaders: Record<string, string> = {};
  if (organizationId) {
    customHeaders['OpenAI-Organization'] = organizationId;
    customHeaders['ChatGPT-Account-Id'] = organizationId;
  }
  if (sessionCookie) {
    customHeaders['Cookie'] = sessionCookie;
  }

  // Helper para consultar ChatGPT Plus / Codex limits con las cabeceras exactas de Orca
  async function queryChatGptWham(authToken: string, accountId?: string): Promise<ApiUsageSnapshot | null> {
    try {
      const headers: Record<string, string> = {
        Authorization: authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
        'User-Agent': 'codex-cli',
        'OpenAI-Beta': 'codex-1',
        originator: 'Codex Desktop',
      };
      if (accountId) {
        headers['ChatGPT-Account-Id'] = accountId;
      }
      if (sessionCookie) {
        headers['Cookie'] = sessionCookie;
      }

      const whamRes = await fetch('https://chatgpt.com/backend-api/wham/usage', {
        headers,
        cache: 'no-store',
      });

      if (whamRes.ok) {
        const wham = await whamRes.json();
        const primary = wham.rate_limit?.primary_window;
        const secondary = wham.rate_limit?.secondary_window;

        const sessionUtil = typeof primary?.used_percent === 'number' ? primary.used_percent : undefined;
        const weeklyUtil = typeof secondary?.used_percent === 'number' ? secondary.used_percent : undefined;
        const sessionResetsAt = primary?.reset_at ? new Date(primary.reset_at * 1000).toISOString() : undefined;
        const weeklyResetsAt = secondary?.reset_at ? new Date(secondary.reset_at * 1000).toISOString() : undefined;

        const rawPlan = wham.plan_type ? String(wham.plan_type) : 'plus';
        const planName = `ChatGPT ${rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1)}`;

        const resetCredits = wham.rate_limit_reset_credits?.available_count;
        const planWithCredits = resetCredits !== undefined && resetCredits > 0
          ? `${planName} (${resetCredits} créditos de reseteo)`
          : planName;

        return {
          fetchedAt,
          sessionUtilization: sessionUtil,
          weeklyUtilization: weeklyUtil,
          sessionResetsAt,
          weeklyResetsAt,
          planType: planWithCredits,
          unavailable: ['accumulatedCost', 'tokensUsed', 'requestCount', 'balance'],
        };
      }
    } catch {
      // continuar
    }
    return null;
  }

  // Session Token / Browser session flow o token JWT / Codex
  const isSessionToken = token.startsWith('sess-') || Boolean(sessionCookie) || token.startsWith('eyJ');

  if (isSessionToken) {
    // 1. Probar ChatGPT wham con el token actual
    const whamResult = await queryChatGptWham(token, organizationId);
    if (whamResult) return whamResult;

    // 2. Si falló, intentar con credenciales locales de Codex si existen
    const localCodex = getLocalCodexCredentials();
    if (localCodex?.accessToken && localCodex.accessToken !== token) {
      const localWham = await queryChatGptWham(localCodex.accessToken, localCodex.accountId);
      if (localWham) return localWham;
    }

    const startTime = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS;
    let accumulatedCost: number | undefined;
    let currency = 'USD';
    let tokensUsed: number | undefined;
    let requestCount: number | undefined;
    const planType = 'OpenAI Platform';

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

    const balanceInfo = await tryFetchBalance(token, customHeaders);

    return {
      fetchedAt,
      balance: balanceInfo.balance,
      accumulatedCost,
      currency: balanceInfo.currency ?? currency,
      tokensUsed,
      requestCount,
      planType,
      unavailable: [
        ...(balanceInfo.balance === undefined ? ['balance'] : []),
        ...(accumulatedCost === undefined ? ['accumulatedCost'] : []),
        ...(tokensUsed === undefined ? ['tokensUsed'] : []),
        ...(requestCount === undefined ? ['requestCount'] : []),
      ],
    };
  }

  // Standard API key flow (project key sk-proj-... o admin key sk-admin-...).
  // usage/completions y costs requieren scopes "api.usage.read"/"api.costs.read"
  // que solo tiene una Admin API Key — una key de proyecto normal, la más
  // habitual, falla ahí con 403. Antes esa llamada no estaba protegida con
  // try/catch, así que ese 403 se propagaba como error duro y la tarjeta no
  // mostraba nada, ni siquiera el saldo. El saldo de crédito (endpoint clásico
  // "dashboard/billing/credit_grants") sí suele responder con cualquier key en
  // cuentas de pago por uso, sin scope de admin — se intenta primero y por
  // separado para poder mostrarlo aunque el resto falle.
  const startTime = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS;

  const snapshot: ApiUsageSnapshot = {
    fetchedAt,
    planType: token.startsWith('sk-admin') ? 'OpenAI API (Admin)' : 'OpenAI API',
    unavailable: [],
  };

  let balanceError: unknown;
  try {
    // Endpoint clásico del dashboard de facturación (no requiere scope de
    // admin), NO va bajo /v1/ como el resto de la API moderna.
    const grants = await openaiGet<OpenAIDashboardCreditGrants>(
      'https://api.openai.com/dashboard/billing/credit_grants',
      token,
      customHeaders
    );
    if (typeof grants.total_available === 'number') {
      snapshot.balance = grants.total_available;
      snapshot.currency = 'USD';
    } else {
      snapshot.unavailable!.push('balance');
    }
  } catch (err) {
    balanceError = err;
    snapshot.unavailable!.push('balance');
  }

  let usageError: unknown;
  try {
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
    snapshot.tokensUsed = tokensUsed;
    snapshot.requestCount = requestCount;
  } catch (err) {
    usageError = err;
    snapshot.unavailable!.push('tokensUsed', 'requestCount');
  }

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
    snapshot.currency = snapshot.currency ?? currency;
  } catch {
    snapshot.unavailable!.push('accumulatedCost');
  }

  // Si absolutamente nada respondió, no devolvemos una tarjeta vacía: se
  // propaga el error más informativo que tengamos (normalmente el 403 de
  // usage/completions, que explica qué tipo de key hace falta).
  if (snapshot.balance === undefined && snapshot.tokensUsed === undefined && snapshot.accumulatedCost === undefined) {
    throw usageError ?? balanceError ?? new Error('No se pudo obtener ningún dato de OpenAI con esta clave.');
  }

  // Si conseguimos algo (ej. el saldo) pero tokens/coste fallaron por falta
  // de permisos, no ocultamos esa explicación solo porque ya no lanzamos un
  // error duro — se muestra como aviso no bloqueante junto a los datos que sí
  // tenemos, en vez de perderla.
  if (usageError instanceof Error) {
    snapshot.error = usageError.message;
  }

  return snapshot;
}
