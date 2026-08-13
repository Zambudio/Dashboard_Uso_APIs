'use client';

import { PointerEvent as ReactPointerEvent, useState } from 'react';
import { ApiProviderConfig } from '@/types/api';
import { getProviderDefinition } from '@/lib/providers';
import { DonutChart } from './DonutChart';
import { UsageBar } from './UsageBar';
import { ProviderLogo } from './ProviderLogo';

interface ProviderCardProps {
  provider: ApiProviderConfig;
  onConfigure: (provider: ApiProviderConfig) => void;
  onToggleVisibility?: (id: string) => void;
  onConnect?: (provider: ApiProviderConfig) => void;
  onRefresh?: (id: string) => Promise<void>;
  onBrowserLogin?: (provider: ApiProviderConfig) => void;
  /** true mientras el refresco inicial (sincronizado, al cargar la página) está en curso para este proveedor. */
  loading?: boolean;
  /** Handle de arrastre para reordenar; si se pasa, aparece un asa arriba a la derecha. */
  dragHandleProps?: { onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void };
  isDragging?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  balance: 'Saldo total',
  accumulatedCost: 'Coste acumulado',
  tokensUsed: 'Tokens consumidos',
  requestCount: 'Nº de peticiones',
};

function currencySymbol(currency?: string): string {
  if (currency === 'CNY') return '¥';
  if (currency === 'USD') return '$';
  return '';
}

function formatRelativeTime(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    // If it's a pre-formatted human string like "16 ago 2026 8:13", return directly
    return iso;
  }
  const diffMs = date.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours <= 0) return 'ya';
  if (diffHours < 1) return `${Math.round(diffHours * 60)} min`;
  if (diffHours < 48) return `${Math.round(diffHours)} h`;
  return `${Math.round(diffHours / 24)} d`;
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

function SkeletonStats() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-white/5 px-3 py-2">
          <div className="skeleton h-2.5 w-20 rounded-full" />
          <div className="skeleton mt-2.5 h-4 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function SkeletonGauges() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 p-3">
        <div className="skeleton h-24 w-24 rounded-full" />
      </div>
      <div className="flex flex-col justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-3 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function ProviderCard({
  provider,
  onConfigure,
  onToggleVisibility,
  onConnect,
  onRefresh,
  onBrowserLogin,
  loading,
  dragHandleProps,
  isDragging,
}: ProviderCardProps) {
  const [refreshing, setRefreshing] = useState(false);
  const definition = getProviderDefinition(provider.provider);

  const statusColors = {
    online: 'bg-emerald-500',
    warning: 'bg-amber-500',
    offline: 'bg-rose-500',
    error: 'bg-rose-500',
    unconfigured: 'bg-slate-500',
  } as const;

  const connected = Boolean(provider.connected);
  const hidden = provider.visibility === 'hidden';
  const usage = provider.usage;
  const unavailable = new Set(usage?.unavailable ?? []);
  // Claude (Anthropic) y Gemini tienen una ventana de sesión de 5h/actual además del
  // límite semanal, pero solo la mostramos si hay datos reales: antes se forzaba
  // también por tipo de proveedor, así que una tarjeta sin sesión iniciada (ej.
  // Claude Pro sin datos) mostraba una barra vacía en 0% con "—" en el reset,
  // ruido sin información. 0 es un valor real (sesión empezada sin uso todavía)
  // y sí debe mostrarse; solo `undefined` en ambos campos oculta la fila.
  const hasSessionWindow = usage?.sessionUtilization !== undefined || usage?.sessionResetsAt !== undefined;
  const isSubscriptionLayout = provider.kind === 'subscription' || usage?.sessionUtilization !== undefined || usage?.weeklyUtilization !== undefined;

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh(provider.id);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-white/10 ${hidden ? 'bg-white/5 opacity-70' : 'bg-[#17171f]'} p-5 shadow-card transition-shadow duration-200 ease-out ${
        isDragging ? 'shadow-card-lift ring-1 ring-cyan-400/40' : ''
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ProviderLogo provider={provider.provider} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{provider.name}</h3>
              <span className={`h-2.5 w-2.5 rounded-full ${statusColors[provider.status] ?? statusColors.unconfigured}`} />
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${connected ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/30' : 'bg-slate-700/70 text-slate-300 border border-slate-500/30'}`}>
                {connected ? 'Conectado' : 'No conectado'}
              </span>
              {usage?.planType && (
                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300">
                  {usage.planType}
                </span>
              )}
              {provider.kind === 'subscription' && !usage?.planType && (
                <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-fuchsia-300">
                  Suscripción
                </span>
              )}
              {hidden && <span className="rounded-full border border-slate-500/40 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300">Oculto</span>}
            </div>
            <p className="mt-1 text-sm text-slate-400">{definition.label}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {dragHandleProps && <DragHandle onPointerDown={dragHandleProps.onPointerDown} />}
          <button
            onClick={() => onConfigure(provider)}
            className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            Configurar
          </button>
        </div>
      </div>

      {usage?.error && (
        <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {usage.error}
        </div>
      )}

      {!connected && !loading && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
          Conecta tu {definition.secretLabel.toLowerCase()} para ver datos reales de uso.
        </div>
      )}

      {connected && !usage && !loading && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
          Sin datos todavía — pulsa &quot;Actualizar&quot;.
        </div>
      )}

      {loading ? (
        isSubscriptionLayout ? <SkeletonGauges /> : <SkeletonStats />
      ) : isSubscriptionLayout ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <DonutChart value={usage?.weeklyUtilization ?? 0} max={100} color="#8b5cf6" label="Uso semanal" />
              <p className="mt-2 text-center text-[11px] tabular text-slate-400">
                Consumido {Math.round(usage?.weeklyUtilization ?? 0)}% · Restante {Math.round(100 - (usage?.weeklyUtilization ?? 0))}%
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              {hasSessionWindow ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    {provider.provider === 'gemini' ? 'Reset uso actual' : 'Reset sesión (5h)'}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular text-cyan-300">{formatRelativeTime(usage?.sessionResetsAt) ?? '—'}</p>
                </div>
              ) : null}
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Reset semanal</p>
                <p className="mt-1 text-xl font-semibold tabular text-fuchsia-300">{formatRelativeTime(usage?.weeklyResetsAt) ?? '—'}</p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {hasSessionWindow ? (
              <UsageBar
                progress={usage?.sessionUtilization ?? 0}
                color="#38bdf8"
                label={provider.provider === 'gemini' ? 'Uso actual' : 'Sesión actual (5h)'}
                secondary={
                  usage?.sessionUtilization !== undefined
                    ? `${Math.round(usage.sessionUtilization)}% · Restante ${Math.round(100 - usage.sessionUtilization)}%`
                    : '—'
                }
              />
            ) : null}
            <UsageBar
              progress={usage?.weeklyUtilization ?? 0}
              color="#8b5cf6"
              label="Límite semanal"
              secondary={
                usage?.weeklyUtilization !== undefined
                  ? `${Math.round(usage.weeklyUtilization)}% · Restante ${Math.round(100 - usage.weeklyUtilization)}%`
                  : '—'
              }
            />
          </div>
        </>
      ) : (
        <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
          {(['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'] as const).map((field) => {
            const value = usage?.[field];
            const isUnavailable = unavailable.has(field);
            return (
              <div key={field} className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{FIELD_LABELS[field]}</p>
                {isUnavailable ? (
                  <p className="mt-1 text-sm text-slate-500" title="Este proveedor no expone este dato en su API pública">
                    No disponible
                  </p>
                ) : value === undefined ? (
                  <p className="mt-1 text-sm text-slate-500">—</p>
                ) : (
                  <p className="mt-1 font-medium tabular text-white">
                    {field === 'balance' || field === 'accumulatedCost'
                      ? `${currencySymbol(usage?.currency)}${value.toFixed(2)}`
                      : value.toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
          {usage?.grantedBalance !== undefined && (
            <div className="rounded-xl bg-white/5 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Saldo regalado</p>
              <p className="mt-1 font-medium tabular text-white">{`${currencySymbol(usage.currency)}${usage.grantedBalance.toFixed(2)}`}</p>
            </div>
          )}
          {usage?.toppedUpBalance !== undefined && (
            <div className="rounded-xl bg-white/5 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Saldo recargado</p>
              <p className="mt-1 font-medium tabular text-white">{`${currencySymbol(usage.currency)}${usage.toppedUpBalance.toFixed(2)}`}</p>
            </div>
          )}
        </div>
      )}

      {provider.provider === 'deepseek' && usage?.currency && (
        <p className="mt-3 text-[11px] text-slate-500">
          DeepSeek solo expone el saldo (no su historial de gasto). El saldo total = regalado + recargado. La plataforma reporta en{' '}
          <span className="font-medium text-slate-300">{usage.currency}</span>.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span>Última actualización</span>
          <span className="ml-2 font-medium tabular text-white">{usage?.fetchedAt ? new Date(usage.fetchedAt).toLocaleTimeString('es-ES') : 'Nunca'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {onBrowserLogin && definition.browserLoginSupported && (
            <button
              type="button"
              onClick={() => onBrowserLogin(provider)}
              className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-xs font-medium text-fuchsia-200 transition hover:bg-fuchsia-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
              title="Abre el navegador web para iniciar sesión y detectar automáticamente tu gasto"
            >
              Iniciar sesión web
            </button>
          )}
          {onRefresh && connected && definition.usageImplemented && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
          )}
          {onConnect && (
            <button
              type="button"
              onClick={() => onConnect(provider)}
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              {connected ? 'Revisar clave' : 'Conectar API'}
            </button>
          )}
          {onToggleVisibility && (
            <button
              type="button"
              onClick={() => onToggleVisibility(provider.id)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {hidden ? 'Mostrar' : 'Ocultar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
