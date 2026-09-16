'use client';

import { PointerEvent as ReactPointerEvent, useState } from 'react';
import { ApiProviderConfig } from '@/types/api';
import { getProviderDefinition } from '@/lib/providers';
import { UsageBar } from './UsageBar';
import { ProviderLogo } from './ProviderLogo';

interface ProviderCardProps {
  provider: ApiProviderConfig;
  onConfigure: (provider: ApiProviderConfig) => void;
  onToggleVisibility?: (id: string) => void;
  onConnect?: (provider: ApiProviderConfig) => void;
  onRefresh?: (id: string) => Promise<void>;
  onBrowserLogin?: (provider: ApiProviderConfig) => void;
  onOpenSync?: (provider: ApiProviderConfig) => void;
  loading?: boolean;
  dragHandleProps?: { onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void };
  isDragging?: boolean;
}

const PROVIDER_URLS: Record<string, string> = {
  'claude-pro': 'https://claude.ai/settings/usage',
  'openai': 'https://chatgpt.com/settings/usage',
  'gemini': 'https://gemini.google.com/usage',
  'deepseek': 'https://platform.deepseek.com/usage',
  'anthropic': 'https://console.anthropic.com/settings/cost',
};

function formatRelativeTime(iso?: string): string | null {
  if (!iso) return null;
  // Si ya es un texto descriptivo
  if (
    iso.includes('min') ||
    iso.includes('Resets') ||
    iso.includes('restablece') ||
    iso.includes('las')
  ) {
    return iso;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return 'en breves instantes';
  const totalMinutes = Math.round(diffMs / (1000 * 60));
  if (totalMinutes < 60) return `en ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) {
    return mins > 0 ? `en ${hours} h ${mins} min` : `en ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `en ${days} d ${remHours} h` : `en ${days} d`;
}


function formatMinutesAgo(isoDate?: string): string {
  if (!isoDate) return 'Sin sincronizar';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Reciente';
  const diffMinutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMinutes <= 0) return 'Justo ahora';
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  return `Hace ${Math.floor(diffHours / 24)} d`;
}

function DragHandle({ onPointerDown }: { onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      aria-label="Arrastrar para reordenar"
      title="Arrastrar para reordenar"
      className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-300 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
        <circle cx="5" cy="3" r="1.2" />
        <circle cx="11" cy="3" r="1.2" />
        <circle cx="5" cy="8" r="1.2" />
        <circle cx="11" cy="8" r="1.2" />
        <circle cx="5" cy="13" r="1.2" />
        <circle cx="11" cy="13" r="1.2" />
      </svg>
    </button>
  );
}

export function ProviderCard({
  provider,
  onConfigure,
  onToggleVisibility,
  onRefresh,
  onOpenSync,
  loading,
  dragHandleProps,
  isDragging,
}: ProviderCardProps) {
  const [refreshing, setRefreshing] = useState(false);

  const usage = provider.usage;
  const hidden = provider.visibility === 'hidden';
  const officialUrl = PROVIDER_URLS[provider.provider];

  const hasUsageData = Boolean(
    usage &&
      (usage.sessionUtilization !== undefined ||
        usage.weeklyUtilization !== undefined ||
        usage.balance !== undefined ||
        usage.accumulatedCost !== undefined ||
        usage.tokensUsed !== undefined)
  );

  const isSubscription =
    provider.kind === 'subscription' ||
    usage?.sessionUtilization !== undefined ||
    usage?.weeklyUtilization !== undefined ||
    provider.provider === 'claude-pro' ||
    provider.id === 'claude-pro' ||
    provider.name.toLowerCase().includes('claude') ||
    provider.provider === 'openai' ||
    provider.provider === 'gemini';

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh(provider.id);
    } finally {
      setRefreshing(false);
    }
  };

  const planBadge =
    usage?.planType ||
    (provider.provider === 'claude-pro' || provider.id === 'claude-pro' || provider.name.toLowerCase().includes('claude')
      ? 'Claude Pro'
      : provider.provider === 'openai'
      ? 'ChatGPT Plus / Team'
      : provider.provider === 'gemini'
      ? 'Google AI Pro (Antigravity)'
      : provider.provider === 'deepseek'
      ? 'DeepSeek Platform'
      : null);

  return (
    <div
      className={`relative flex flex-col justify-between h-full rounded-2xl border ${
        hasUsageData ? 'border-white/[0.12] bg-[#141724]' : 'border-white/[0.08] bg-[#11131c]'
      } p-5 shadow-xl transition-all duration-200 ${
        isDragging ? 'scale-[1.02] shadow-cyan-500/10 ring-2 ring-cyan-500/50' : ''
      }`}
    >
      {/* Cabecera de la tarjeta */}
      <div>
        <div className="flex items-start justify-between gap-3 min-h-[68px]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] p-2 shadow-inner mt-0.5">
              <ProviderLogo provider={provider.provider} />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-bold text-white leading-tight">{provider.name}</h3>
              {planBadge ? (
                <div>
                  <span className="inline-block rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                    {planBadge}
                  </span>
                </div>
              ) : (
                <div className="h-[21px]" aria-hidden="true" />
              )}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    hasUsageData ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-slate-500'
                  }`}
                />
                <span>{hasUsageData ? formatMinutesAgo(usage?.fetchedAt) : 'Sin sincronizar'}</span>
                {officialUrl && (
                  <>
                    <span>·</span>
                    <a
                      href={officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400/90 hover:text-cyan-300 hover:underline inline-flex items-center gap-0.5"
                    >
                      Pestaña de uso ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>


          <div className="flex shrink-0 items-center gap-1.5">
            {dragHandleProps && <DragHandle onPointerDown={dragHandleProps.onPointerDown} />}
            <button
              onClick={() => onConfigure(provider)}
              title="Configurar clave o ajustes"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Mensaje de error si hubo */}
        {usage?.error && (
          <div className="mt-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            ⚠️ {usage.error}
          </div>
        )}

        {/* CONTENIDO PRINCIPAL: LAS DOS BARRAS */}
        <div className="mt-4 space-y-3 min-h-[316px] flex flex-col justify-between">
          {loading ? (
            <div className="space-y-3 min-h-[316px] flex flex-col justify-between">
              <div className="h-[124px] w-full animate-pulse rounded-2xl bg-white/5" />
              <div className="h-[124px] w-full animate-pulse rounded-2xl bg-white/5" />
              <div className="h-11 w-full animate-pulse rounded-xl bg-white/5" />
            </div>
          ) : isSubscription ? (
            <>
              {/* BARRA 1: SESIÓN ACTUAL */}
              <UsageBar
                progress={usage?.sessionUtilization ?? 0}
                label={provider.provider === 'gemini' ? 'Sesión actual (5h)' : 'Sesión actual (5h)'}
                resetBadge={formatRelativeTime(usage?.sessionResetsAt)}
                secondary={
                  usage?.sessionUtilization !== undefined
                    ? `${Math.round(usage.sessionUtilization)}% usado`
                    : 'Sin datos'
                }
              />

              {/* BARRA 2: LÍMITE SEMANAL */}
              <UsageBar
                progress={usage?.weeklyUtilization ?? 0}
                label="Límite semanal"
                resetBadge={formatRelativeTime(usage?.weeklyResetsAt)}
                secondary={
                  usage?.weeklyUtilization !== undefined
                    ? `${Math.round(usage.weeklyUtilization)}% usado`
                    : 'Sin datos'
                }
              />

              {/* SALDO O CRÉDITOS SI CORRESPONDE (O SPACER PARA ALINEACIÓN EXACTA) */}
              {usage?.balance !== undefined || usage?.accumulatedCost !== undefined ? (
                <div className="flex h-11 items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c0e17]/90 px-4 text-xs text-slate-300">
                  <span className="text-slate-400 font-semibold">
                    {usage.accumulatedCost !== undefined ? 'Créditos gastados' : 'Saldo de créditos'}
                  </span>
                  <span className="font-bold tabular-nums text-white text-sm">
                    {usage.accumulatedCost !== undefined
                      ? `${usage.accumulatedCost.toFixed(2)} ${usage.currency || 'EUR'}`
                      : `${Number(usage.balance).toLocaleString()} ${usage.currency || 'créditos'}`}
                  </span>
                </div>
              ) : (
                <div className="h-11" aria-hidden="true" />
              )}
            </>
          ) : (
            /* VISTA DE PROVEEDORES PURAMENTE API (DeepSeek, OpenAI API, Anthropic API) */
            <div className="flex h-full flex-col justify-between min-h-[316px] space-y-3">
              <div className="flex-1 flex flex-col justify-center rounded-2xl border border-white/[0.08] bg-[#0c0e17]/90 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Saldo Disponible</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-emerald-400 tracking-tight">
                  {usage?.balance !== undefined
                    ? `${usage.currency === 'CNY' ? '¥' : '$'}${usage.balance.toFixed(2)}`
                    : '—'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e17]/90 p-4">
                  <p className="text-xs font-medium text-slate-400">Tokens consumidos</p>
                  <p className="mt-1.5 text-base font-bold text-slate-200 tabular-nums">
                    {usage?.tokensUsed !== undefined ? usage.tokensUsed.toLocaleString() : '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e17]/90 p-4">
                  <p className="text-xs font-medium text-slate-400">Peticiones</p>
                  <p className="mt-1.5 text-base font-bold text-slate-200 tabular-nums">
                    {usage?.requestCount !== undefined ? usage.requestCount.toLocaleString() : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Pie de la tarjeta: Acciones rápidas */}
      <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-3.5">
        {onOpenSync && (
          <button
            onClick={() => onOpenSync(provider)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition"
          >
            <span>⚡</span>
            <span>Sincronizar</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          {onToggleVisibility && (
            <button
              onClick={() => onToggleVisibility(provider.id)}
              className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
            >
              {hidden ? 'Mostrar' : 'Ocultar'}
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 transition disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin' : ''}>↻</span>
            <span>{refreshing ? 'Actualizando...' : 'Actualizar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
