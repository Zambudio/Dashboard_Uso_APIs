'use client';

import { useState } from 'react';
import { ApiProviderConfig } from '@/types/api';
import { getProviderDefinition } from '@/lib/providers';
import { DonutChart } from './DonutChart';
import { UsageBar } from './UsageBar';

interface ProviderCardProps {
  provider: ApiProviderConfig;
  onConfigure: (provider: ApiProviderConfig) => void;
  onToggleVisibility?: (id: string) => void;
  onConnect?: (provider: ApiProviderConfig) => void;
  onRefresh?: (id: string) => Promise<void>;
}

const FIELD_LABELS: Record<string, string> = {
  balance: 'Saldo',
  accumulatedCost: 'Coste acumulado',
  tokensUsed: 'Tokens consumidos',
  requestCount: 'Nº de peticiones',
};

function formatRelativeTime(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours <= 0) return 'ya';
  if (diffHours < 1) return `${Math.round(diffHours * 60)} min`;
  if (diffHours < 48) return `${Math.round(diffHours)} h`;
  return `${Math.round(diffHours / 24)} d`;
}

export function ProviderCard({ provider, onConfigure, onToggleVisibility, onConnect, onRefresh }: ProviderCardProps) {
  const [refreshing, setRefreshing] = useState(false);
  const definition = getProviderDefinition(provider.provider);

  const statusColors = {
    online: 'bg-emerald-500',
    warning: 'bg-amber-500',
    offline: 'bg-rose-500',
    error: 'bg-rose-500',
    unconfigured: 'bg-slate-500',
  } as const;

  const connected = Boolean(provider.apiKey);
  const hidden = provider.visibility === 'hidden';
  const usage = provider.usage;
  const unavailable = new Set(usage?.unavailable ?? []);

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
    <div className={`rounded-2xl border border-white/10 ${hidden ? 'bg-white/5 opacity-70' : 'bg-[#1b1b23]'} p-5 shadow-2xl shadow-black/30`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{provider.name}</h3>
            <span className={`h-2.5 w-2.5 rounded-full ${statusColors[provider.status] ?? statusColors.unconfigured}`} />
            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${connected ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/30' : 'bg-slate-700/70 text-slate-300 border border-slate-500/30'}`}>
              {connected ? 'Conectado' : 'No conectado'}
            </span>
            {provider.kind === 'subscription' && (
              <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-fuchsia-300">
                Suscripción
              </span>
            )}
            {hidden && <span className="rounded-full border border-slate-500/40 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300">Oculto</span>}
          </div>
          <p className="mt-1 text-sm text-slate-400">{definition.label}</p>
        </div>
        <button onClick={() => onConfigure(provider)} className="text-xs text-slate-400 transition hover:text-cyan-300">
          Configurar
        </button>
      </div>

      {usage?.error && (
        <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {usage.error}
        </div>
      )}

      {!connected && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
          Conecta tu {definition.secretLabel.toLowerCase()} para ver datos reales de uso.
        </div>
      )}

      {connected && !usage && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
          Sin datos todavía — pulsa &quot;Actualizar&quot;.
        </div>
      )}

      {provider.kind === 'subscription' ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <DonutChart value={usage?.weeklyUtilization ?? 0} max={100} color="#8b5cf6" label="Uso semanal" />
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Reset sesión (5h)</p>
              <p className="mt-1 text-xl font-semibold text-cyan-300">{formatRelativeTime(usage?.sessionResetsAt) ?? '—'}</p>
            </div>
          </div>
          <div className="space-y-4">
            <UsageBar
              progress={usage?.sessionUtilization ?? 0}
              color="#38bdf8"
              label="Sesión actual (5h)"
              secondary={usage?.sessionUtilization !== undefined ? `${Math.round(usage.sessionUtilization)}%` : '—'}
            />
            <UsageBar
              progress={usage?.weeklyUtilization ?? 0}
              color="#8b5cf6"
              label="Límite semanal"
              secondary={usage?.weeklyUtilization !== undefined ? `${Math.round(usage.weeklyUtilization)}%` : '—'}
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
                  <p className="mt-1 font-medium text-white">
                    {field === 'balance' || field === 'accumulatedCost'
                      ? `${usage?.currency === 'CNY' ? '¥' : '$'}${value.toFixed(2)}`
                      : value.toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span>Última actualización</span>
          <span className="ml-2 font-medium text-white">{usage?.fetchedAt ? new Date(usage.fetchedAt).toLocaleTimeString('es-ES') : 'Nunca'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {onRefresh && connected && definition.usageImplemented && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
          )}
          {onConnect && (
            <button
              type="button"
              onClick={() => onConnect(provider)}
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
            >
              {connected ? 'Revisar conexión' : 'Conectar'}
            </button>
          )}
          {onToggleVisibility && (
            <button
              type="button"
              onClick={() => onToggleVisibility(provider.id)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              {hidden ? 'Mostrar tarjeta' : 'Ocultar tarjeta'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
