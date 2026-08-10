'use client';

import { FormEvent, useMemo, useState } from 'react';
import { ProviderKey } from '@/types/api';
import { PROVIDER_DEFINITIONS, getProviderDefinition } from '@/lib/providers';
import { ProviderLogo } from './ProviderLogo';

interface AddProviderFormProps {
  onSubmit: (name: string, provider: ProviderKey, apiKey: string) => void;
  onCancel: () => void;
  onBrowserLogin?: (name: string, provider: ProviderKey) => void;
}

export function AddProviderForm({ onSubmit, onCancel, onBrowserLogin }: AddProviderFormProps) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<ProviderKey>('openai');
  const [apiKey, setApiKey] = useState('');

  const definition = useMemo(() => getProviderDefinition(provider), [provider]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), provider, apiKey.trim());
    setName('');
    setProvider('openai');
    setApiKey('');
  };

  const handleBrowserLoginClick = () => {
    const finalName = name.trim() || definition.label;
    if (onBrowserLogin) {
      onBrowserLogin(finalName, provider);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-[#151521] p-5 shadow-xl shadow-black/20">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Añadir proveedor</h2>
          <p className="text-sm text-slate-400">Puedes conectar iniciando sesión en tu navegador o introduciendo la clave manualmente.</p>
        </div>
        <button type="button" onClick={onCancel} className="text-sm text-slate-400 transition hover:text-white">
          Cancelar
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-300">
          <span>Nombre del proveedor</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#1f1f2b] px-3 py-2 text-white outline-none ring-0"
            placeholder={definition.label}
          />
        </label>

        <label className="space-y-2 text-sm text-slate-300">
          <span>Proveedor</span>
          <div className="flex items-center gap-2">
            <ProviderLogo provider={provider} size="sm" />
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as ProviderKey)}
              className="w-full rounded-xl border border-white/10 bg-[#1f1f2b] px-3 py-2 text-white outline-none"
            >
              {Object.values(PROVIDER_DEFINITIONS).map((def) => (
                <option key={def.key} value={def.key}>
                  {def.label}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      {definition.browserLoginSupported && onBrowserLogin && (
        <div className="mt-4 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-fuchsia-200">Recomendado: Inicio de sesión web</p>
              <p className="text-xs text-slate-300">
                Inicia sesión en {definition.label} en el navegador y vincularemos tus datos de gasto automáticamente sin copiar claves.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBrowserLoginClick}
              className="shrink-0 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:opacity-90"
            >
              Iniciar sesión en {definition.label}
            </button>
          </div>
        </div>
      )}

      <label className="mt-4 block space-y-2 text-sm text-slate-300">
        <span>{definition.secretLabel} (opción manual)</span>
        <input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#1f1f2b] px-3 py-2 text-white outline-none"
          placeholder={definition.secretPlaceholder}
          type="password"
        />
      </label>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
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

      <div className="mt-5 flex justify-end">
        <button type="submit" className="rounded-xl bg-cyan-600/30 border border-cyan-400/40 px-4 py-2 font-medium text-cyan-200 transition hover:bg-cyan-600/50">
          Guardar integración manual
        </button>
      </div>
    </form>
  );
}
