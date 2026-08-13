import { NextRequest, NextResponse } from 'next/server';
import { readDashboardState, writeDashboardState } from '@/lib/env-keys.server';
import { ApiProviderConfig, ApiUsageSnapshot, DashboardPreferences } from '@/types/api';

export const dynamic = 'force-dynamic';

const providerKeys = new Set(['openai', 'anthropic', 'deepseek', 'gemini', 'claude-pro', 'custom']);
const statuses = new Set(['online', 'warning', 'offline', 'error', 'unconfigured']);

function sanitizeUsage(value: unknown): ApiUsageSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const usage = value as Partial<ApiUsageSnapshot>;
  if (typeof usage.fetchedAt !== 'string') return undefined;
  const number = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
  const text = (candidate: unknown, max = 500) => typeof candidate === 'string' ? candidate.slice(0, max) : undefined;
  return {
    fetchedAt: usage.fetchedAt,
    balance: number(usage.balance),
    currency: text(usage.currency, 12),
    grantedBalance: number(usage.grantedBalance),
    toppedUpBalance: number(usage.toppedUpBalance),
    accumulatedCost: number(usage.accumulatedCost),
    tokensUsed: number(usage.tokensUsed),
    requestCount: number(usage.requestCount),
    sessionUtilization: number(usage.sessionUtilization),
    weeklyUtilization: number(usage.weeklyUtilization),
    sessionResetsAt: text(usage.sessionResetsAt, 64),
    weeklyResetsAt: text(usage.weeklyResetsAt, 64),
    planType: text(usage.planType, 120),
    tier: text(usage.tier, 120),
    unavailable: Array.isArray(usage.unavailable) ? usage.unavailable.filter((item): item is string => typeof item === 'string').slice(0, 50) : undefined,
    error: text(usage.error, 1000),
  };
}

function sanitizeProviders(value: unknown): ApiProviderConfig[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('invalid providers');
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('invalid provider');
    const provider = item as Partial<ApiProviderConfig>;
    if (!provider.id || !/^[a-z0-9][a-z0-9-]{0,127}$/i.test(provider.id)) throw new Error('invalid provider id');
    if (!provider.provider || !providerKeys.has(provider.provider)) throw new Error('invalid provider kind');
    if (!provider.name || provider.name.length > 120) throw new Error('invalid provider name');
    if (provider.kind !== 'api' && provider.kind !== 'subscription') throw new Error('invalid provider type');
    return {
      id: provider.id,
      name: provider.name,
      provider: provider.provider,
      kind: provider.kind,
      apiKey: '',
      connected: Boolean(provider.connected),
      status: statuses.has(provider.status || '') ? provider.status! : 'unconfigured',
      visibility: provider.visibility === 'hidden' ? 'hidden' : 'visible',
      usage: sanitizeUsage(provider.usage),
    };
  });
}

function sanitizePreferences(value: unknown): DashboardPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid preferences');
  const preferences = value as Partial<DashboardPreferences>;
  if (preferences.refreshWidgetSeconds !== undefined && (preferences.refreshWidgetSeconds < 15 || preferences.refreshWidgetSeconds > 86400)) {
    throw new Error('invalid refresh interval');
  }
  if (preferences.widgetOpacity !== undefined && (preferences.widgetOpacity < 30 || preferences.widgetOpacity > 100)) {
    throw new Error('invalid opacity');
  }
  const ids = (candidate: unknown) => Array.isArray(candidate)
    ? [...new Set(candidate.filter((id): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/i.test(id)))].slice(0, 100)
    : undefined;
  const sortOrders = new Set(['default', 'status', 'balance', 'cost']);
  const themes = new Set(['aurora', 'esmeralda', 'ambar', 'violeta', 'mono']);
  return {
    showHiddenProviders: Boolean(preferences.showHiddenProviders),
    showSummaryCards: preferences.showSummaryCards !== false,
    sortOrder: sortOrders.has(preferences.sortOrder || '') ? preferences.sortOrder! : 'default',
    cardOrder: ids(preferences.cardOrder),
    refreshWidgetSeconds: preferences.refreshWidgetSeconds ?? 300,
    widgetOpacity: preferences.widgetOpacity ?? 92,
    widgetHiddenProviderIds: ids(preferences.widgetHiddenProviderIds),
    deletedDefaultProviderIds: ids(preferences.deletedDefaultProviderIds),
    widgetTheme: themes.has(preferences.widgetTheme || '') ? preferences.widgetTheme : 'aurora',
  };
}

export async function GET() {
  return NextResponse.json(await readDashboardState<{ providers: ApiProviderConfig[] | null; preferences: DashboardPreferences | null }>());
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as { providers?: unknown; preferences?: unknown };
    const sanitized: { providers?: ApiProviderConfig[]; preferences?: DashboardPreferences } = {};
    if (body.providers !== undefined) sanitized.providers = sanitizeProviders(body.providers);
    if (body.preferences !== undefined) sanitized.preferences = sanitizePreferences(body.preferences);
    await writeDashboardState(sanitized);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'ConfiguraciÃ³n invÃ¡lida.' }, { status: 400 });
  }
}
