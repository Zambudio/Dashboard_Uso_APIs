'use client';

import { ApiProviderConfig, DashboardPreferences } from '@/types/api';

interface DashboardSettingsPanelProps {
  preferences: DashboardPreferences;
  providers: ApiProviderConfig[];
  onSave: (prefs: DashboardPreferences) => void;
  onClose: () => void;
}

const WIDGET_THEMES: { id: NonNullable<DashboardPreferences['widgetTheme']>; label: string; swatch: [string, string] }[] = [
  { id: 'aurora', label: 'Aurora (cian/fucsia)', swatch: ['#22d3ee', '#d946ef'] },
  { id: 'esmeralda', label: 'Esmeralda', swatch: ['#10b981', '#2dd4bf'] },
  { id: 'ambar', label: 'Ámbar', swatch: ['#f59e0b', '#fb923c'] },
  { id: 'violeta', label: 'Violeta', swatch: ['#8b5cf6', '#ec4899'] },
  { id: 'mono', label: 'Monocromo', swatch: ['#94a3b8', '#cbd5e1'] },
];

export function DashboardSettingsPanel({ preferences, providers, onSave, onClose }: DashboardSettingsPanelProps) {
  const widgetHidden = new Set(preferences.widgetHiddenProviderIds ?? []);
  const activeTheme = preferences.widgetTheme ?? 'aurora';

  function toggleWidgetVisible(id: string, visible: boolean) {
    const next = new Set(widgetHidden);
    if (visible) next.delete(id);
    else next.add(id);
    onSave({ ...preferences, widgetHiddenProviderIds: Array.from(next) });
  }
  return (
    <div className="rounded-3xl border border-white/10 bg-[#10101a]/95 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Panel de control</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Preferencias del dashboard</h2>
          <p className="mt-2 text-sm text-slate-400">Ajusta la visibilidad, orden y el comportamiento de los proveedores.</p>
        </div>
        <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10">
          Cerrar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
          <div className="flex items-center justify-between">
            <span>Mostrar proveedores ocultos</span>
            <input
              type="checkbox"
              checked={preferences.showHiddenProviders}
              onChange={(event) => onSave({ ...preferences, showHiddenProviders: event.target.checked })}
              className="h-5 w-5 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-400"
            />
          </div>
          <p className="text-xs text-slate-500">Activa esto para gestionar las integraciones que has ocultado.</p>
        </label>

        <label className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
          <div className="flex items-center justify-between">
            <span>Mostrar resumen global</span>
            <input
              type="checkbox"
              checked={preferences.showSummaryCards}
              onChange={(event) => onSave({ ...preferences, showSummaryCards: event.target.checked })}
              className="h-5 w-5 rounded border-white/20 bg-slate-900 text-fuchsia-500 focus:ring-fuchsia-400"
            />
          </div>
          <p className="text-xs text-slate-500">Oculta o muestra los totales principales del dashboard.</p>
        </label>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
        <label className="flex items-center justify-between gap-3">
          <span>Orden de tarjetas</span>
          <select
            value={preferences.sortOrder}
            onChange={(event) => onSave({ ...preferences, sortOrder: event.target.value as DashboardPreferences['sortOrder'] })}
            className="rounded-xl border border-white/10 bg-[#141424] px-3 py-2 text-white"
          >
            <option value="default">Por añadido</option>
            <option value="status">Por estado</option>
            <option value="balance">Por saldo</option>
            <option value="cost">Por coste</option>
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">Selecciona cómo se ordenan las tarjetas de proveedor.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
        <label className="flex items-center justify-between gap-3">
          <span>Refresco del widget de escritorio (segundos)</span>
          <input
            type="number"
            min={30}
            step={30}
            value={preferences.refreshWidgetSeconds ?? 300}
            onChange={(event) => onSave({ ...preferences, refreshWidgetSeconds: Number(event.target.value) || 300 })}
            className="w-24 rounded-xl border border-white/10 bg-[#141424] px-3 py-2 text-white"
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">Cada cuánto consulta el widget flotante los datos de todos los proveedores.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
        <label className="flex items-center justify-between gap-3">
          <span>Transparencia del widget de escritorio</span>
          <span className="tabular text-white">{preferences.widgetOpacity ?? 92}%</span>
        </label>
        <input
          type="range"
          min={30}
          max={100}
          step={2}
          value={preferences.widgetOpacity ?? 92}
          onChange={(event) => onSave({ ...preferences, widgetOpacity: Number(event.target.value) })}
          className="mt-3 w-full accent-cyan-400"
        />
        <p className="mt-2 text-xs text-slate-500">Al 100% el panel es sólido; valores bajos lo hacen más transparente sobre el escritorio.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
        <p>Tema de color del widget de escritorio</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {WIDGET_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSave({ ...preferences, widgetTheme: theme.id })}
              className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition ${
                activeTheme === theme.id ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-white/10 bg-[#141424] hover:bg-white/5'
              }`}
            >
              <span className="flex gap-1">
                <span className="h-4 w-4 rounded-full" style={{ background: theme.swatch[0] }} />
                <span className="h-4 w-4 rounded-full" style={{ background: theme.swatch[1] }} />
              </span>
              <span className="text-[11px] text-slate-300">{theme.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
        <p>Proveedores visibles en el widget</p>
        <p className="mt-1 text-xs text-slate-500">Independiente de &quot;Ocultar&quot; en las tarjetas: solo afecta al panel flotante, no al dashboard web.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {providers.map((provider) => (
            <label key={provider.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#141424] px-3 py-2">
              <span className="truncate">{provider.name}</span>
              <input
                type="checkbox"
                checked={!widgetHidden.has(provider.id)}
                onChange={(event) => toggleWidgetVisible(provider.id, event.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-400"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
