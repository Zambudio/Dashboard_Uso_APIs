import { ApiUsageSnapshot } from '@/types/api';
import { getLocalClaudeCredentials } from '@/lib/local-subscriptions.server';

const OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

interface ClaudeUsageWindowRaw {
  utilization?: number;
  resets_at?: string;
  limit_dollars?: number | null;
  used_dollars?: number | null;
}

interface ClaudeOAuthUsageResponse {
  five_hour?: ClaudeUsageWindowRaw;
  seven_day?: ClaudeUsageWindowRaw;
  extra_usage?: {
    is_enabled?: boolean;
    used_credits?: number;
    currency?: string;
  };
  spend?: {
    used?: {
      amount_minor?: number;
      currency?: string;
      exponent?: number;
    };
  };
  limits?: Array<{
    kind?: string;
    group?: string;
    percent?: number;
    resets_at?: string;
    scope?: unknown;
  }>;
  seven_day_breakdown?: {
    as_of?: string;
    rows?: Array<{
      key?: string;
      display_name?: string;
      percent?: number;
    }>;
  };
}

function normalizeUtilization(val?: number): number | undefined {
  if (val === undefined || val === null || Number.isNaN(val)) return undefined;
  if (val > 0 && val <= 1) {
    return Math.round(val * 100);
  }
  return Math.min(100, Math.max(0, Math.round(val)));
}

/**
 * Consulta la cuota oficial de suscripción de Claude mediante el endpoint OAuth
 * utilizado por Claude Code y Orca.
 */
export async function fetchClaudeOAuthUsage(token?: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();
  let authToken = token?.trim();

  // Si no se proporcionó token o está vacío, intentar leerlo automáticamente de ~/.claude/.credentials.json
  if (!authToken || authToken === '{}') {
    const local = getLocalClaudeCredentials();
    if (local?.token) {
      authToken = local.token;
    }
  }

  // Si viene en formato JSON empaquetado
  if (authToken && authToken.startsWith('{')) {
    try {
      const parsed = JSON.parse(authToken);
      if (parsed.token) authToken = parsed.token;
      else if (parsed.accessToken) authToken = parsed.accessToken;
      else if (parsed.claudeAiOauth?.accessToken) authToken = parsed.claudeAiOauth.accessToken;
    } catch {
      // continuar
    }
  }

  if (!authToken) {
    throw new Error('No se encontraron credenciales de Claude OAuth (token no disponible ni en ~/.claude/.credentials.json).');
  }

  const res = await fetch(OAUTH_USAGE_URL, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'claude-code/2.1.0',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      // Intentar releer por si Claude Code actualizó el fichero recientemente
      const freshLocal = getLocalClaudeCredentials();
      if (freshLocal?.token && freshLocal.token !== authToken) {
        return fetchClaudeOAuthUsage(freshLocal.token);
      }
      throw new Error('Token de Claude OAuth caducado o no autorizado (401). Ejecuta "claude" en tu terminal para refrescar tu sesión.');
    }
    throw new Error(`Claude OAuth API ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }

  const data = (await res.json()) as ClaudeOAuthUsageResponse;

  const sessionUtil = normalizeUtilization(data.five_hour?.utilization);
  const weeklyUtil = normalizeUtilization(data.seven_day?.utilization);

  let accumulatedCost: number | undefined;
  let currency: string | undefined = 'EUR';

  if (data.spend?.used?.amount_minor !== undefined && data.spend.used.exponent !== undefined) {
    accumulatedCost = data.spend.used.amount_minor / Math.pow(10, data.spend.used.exponent);
    currency = data.spend.used.currency || 'EUR';
  } else if (data.extra_usage?.used_credits !== undefined) {
    accumulatedCost = data.extra_usage.used_credits;
    currency = data.extra_usage.currency || 'EUR';
  }

  const breakdownSummary = data.seven_day_breakdown?.rows
    ?.filter((r) => (r.percent ?? 0) > 0)
    ?.map((r) => `${r.display_name}: ${r.percent}%`)
    ?.join(' • ');

  const planType = breakdownSummary
    ? `Claude Pro (${breakdownSummary})`
    : 'Claude Pro (OAuth)';

  return {
    fetchedAt,
    sessionUtilization: sessionUtil,
    weeklyUtilization: weeklyUtil,
    sessionResetsAt: data.five_hour?.resets_at,
    weeklyResetsAt: data.seven_day?.resets_at,
    accumulatedCost,
    currency,
    planType,
    unavailable: ['balance', 'tokensUsed', 'requestCount'],
  };
}
