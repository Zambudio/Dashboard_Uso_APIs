'use client';

import { useMemo, useState } from 'react';
import { ApiProviderConfig } from '@/types/api';
import { getProviderDefinition } from '@/lib/providers';
import { ProviderLogo } from './ProviderLogo';

interface ProviderSettingsPanelProps {
  provider: ApiProviderConfig;
  onSave: (updated: ApiProviderConfig) => void;
  onClose: () => void;
  onBrowserLogin?: (provider: ApiProviderConfig) => void;
}

export function ProviderSettingsPanel({ provider, onSave, onClose, onBrowserLogin }: ProviderSettingsPanelProps) {
  const [form, setForm] = useState(provider);
  const hasApiKey = Boolean(form.apiKey);
  const definition = getProviderDefinition(form.provider);

  const statusTone = useMemo(() => {
    switch (form.status) {
      case 'online': return 'text-emerald-300';
      case 'warning': return 'text-amber-300';
      default: return 'text-rose-300';
    }
  }, [form.status]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#13131a] p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <ProviderLogo provider={provider.provider} />
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Configuración</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{provider.name}</h3>
          </div>
        </div>
        <button onClick={onClose} className="text-sm text-slate-400 transition hover:text-white">Cerrar</button>
      </div>

      {definition.browserLoginSupported && onBrowserLogin && (
        <div className="mb-5 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-fuchsia-200">Inicio de sesión automático por navegador</p>
              <p className="text-xs text-slate-300">
                Abre {definition.label} en una ventana de Chromium, haz login y extraeremos tus datos de consumo automáticamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onBrowserLogin(provider);
              }}
              className="shrink-0 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:opacity-90"
            >
              Iniciar sesión web
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-300">
          <span>Nombre</span>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="w-full rounded-xl border border-white/10 bg-[#1f1f2b] px-3 py-2 text-white"
          />
        </label>

        <label className="space-y-2 text-sm text-slate-300">
          <span>Estado</span>
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as ApiProviderConfig['status'] })}
            className="w-full rounded-xl border border-white/10 bg-[#1f1f2b] px-3 py-2 text-white"
          >
            <option value="online">Online</option>
            <option value="warning">Warning</option>
            <option value="offline">Offline</option>
            <option value="error">Error</option>
          </select>
        </label>
      </div>

      <label className="mt-4 block space-y-2 text-sm text-slate-300">
        <span>{definition.secretLabel} (manual)</span>
        <input
          type="password"
          value={form.apiKey}
          onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
          className="w-full rounded-xl border border-white/10 bg-[#1f1f2b] px-3 py-2 text-white"
          placeholder={hasApiKey ? 'Guardada en el .env local — escribe para reemplazarla' : definition.secretPlaceholder}
        />
      </label>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
        {definition.helpText}
        {definition.helpUrl && (
          <>
            {' '}
            <a href={definition.helpUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline hover:text-cyan-200">
              Ver en {new URL(definition.helpUrl).hostname}
            </a>
          </>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
        <p>La clave se guarda en el archivo .env local junto al ejecutable, no en el navegador ni en ningún servidor externo.</p>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10">
          Cancelar
        </button>
        <button onClick={() => onSave(form)} className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${statusTone} bg-white/10`}>
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
