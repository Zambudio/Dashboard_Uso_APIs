'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddProviderForm } from '@/components/AddProviderForm';
import { DashboardSettingsPanel } from '@/components/DashboardSettingsPanel';
import { ProviderCard } from '@/components/ProviderCard';
import { ProviderSettingsPanel } from '@/components/ProviderSettingsPanel';
import { fetchProviderUsage, loadEnvKeys, loadPreferences, loadProviders, savePreferences, saveProviders } from '@/lib/storage';
import { getProviderDefinition } from '@/lib/providers';
import { ApiProviderConfig, DashboardPreferences, ProviderKey, ProviderVisibility } from '@/types/api';

const initialProviders: ApiProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', provider: 'openai', kind: 'api', apiKey: '', status: 'unconfigured', visibility: 'visible' },
  { id: 'anthropic', name: 'Anthropic Claude (API)', provider: 'anthropic', kind: 'api', apiKey: '', status: 'unconfigured', visibility: 'visible' },
  { id: 'deepseek', name: 'DeepSeek', provider: 'deepseek', kind: 'api', apiKey: '', status: 'unconfigured', visibility: 'visible' },
  { id: 'claude-pro', name: 'Claude Pro', provider: 'claude-pro', kind: 'subscription', apiKey: '', status: 'unconfigured', visibility: 'visible' },
];

const defaultPreferences: DashboardPreferences = {
  showHiddenProviders: false,
  showSummaryCards: true,
  sortOrder: 'default',
};

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

export default function HomePage() {
  const [providers, setProviders] = useState<ApiProviderConfig[]>(initialProviders);
  const [preferences, setPreferences] = useState<DashboardPreferences>(defaultPreferences);
  const [showForm, setShowForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ApiProviderConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const stored = loadProviders();
    const storedPrefs = loadPreferences();

    if (stored.length) {
      setProviders(stored);
    } else {
      saveProviders(initialProviders);
    }

    if (storedPrefs) {
      setPreferences(storedPrefs);
    }
  }, []);

  const saveAllProviders = useCallback((updated: ApiProviderConfig[]) => {
    setProviders(updated);
    saveProviders(updated);
  }, []);

  const refreshProvider = useCallback(async (id: string) => {
    setProviders((current) => {
      const target = current.find((provider) => provider.id === id);
      if (!target || !target.apiKey) return current;

      fetchProviderUsage(id, target.provider).then((snapshot) => {
        setProviders((latest) => {
          const next = latest.map((provider) =>
            provider.id === id
              ? { ...provider, usage: snapshot, status: snapshot.error ? ('error' as const) : ('online' as const) }
              : provider
          );
          saveProviders(next);
          return next;
        });
      });

      return current;
    });
  }, []);

  useEffect(() => {
    loadEnvKeys().then((envKeys) => {
      setProviders((current) => {
        const merged = current.map((provider) => ({ ...provider, apiKey: envKeys[provider.id] ?? provider.apiKey ?? '' }));
        merged
          .filter((provider) => provider.apiKey && getProviderDefinition(provider.provider).usageImplemented)
          .forEach((provider) => refreshProvider(provider.id));
        return merged;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalBalance = useMemo(() => providers.reduce((sum, item) => sum + (item.usage?.balance ?? 0), 0), [providers]);
  const totalCost = useMemo(() => providers.reduce((sum, item) => sum + (item.usage?.accumulatedCost ?? 0), 0), [providers]);
  const visibleCount = useMemo(() => providers.filter((provider) => provider.visibility !== 'hidden').length, [providers]);
  const hiddenCount = useMemo(() => providers.filter((provider) => provider.visibility === 'hidden').length, [providers]);
  const connectedCount = useMemo(() => providers.filter((provider) => provider.apiKey && provider.visibility !== 'hidden').length, [providers]);

  const visibleProviders = useMemo(() => {
    const filtered = providers.filter((provider) => preferences.showHiddenProviders || provider.visibility !== 'hidden');
    switch (preferences.sortOrder) {
      case 'status':
        return [...filtered].sort((a, b) => a.status.localeCompare(b.status));
      case 'balance':
        return [...filtered].sort((a, b) => (b.usage?.balance ?? 0) - (a.usage?.balance ?? 0));
      case 'cost':
        return [...filtered].sort((a, b) => (b.usage?.accumulatedCost ?? 0) - (a.usage?.accumulatedCost ?? 0));
      default:
        return filtered;
    }
  }, [preferences, providers]);

  const saveAllPreferences = (updated: DashboardPreferences) => {
    setPreferences(updated);
    savePreferences(updated);
  };

  const addProvider = (name: string, provider: ProviderKey, apiKey: string) => {
    const definition = getProviderDefinition(provider);
    const nextProvider: ApiProviderConfig = {
      id: `${provider}-${Date.now()}`,
      name,
      provider,
      kind: definition.kind,
      apiKey,
      status: 'unconfigured',
      visibility: 'visible',
    };

    saveAllProviders([nextProvider, ...providers]);
    setShowForm(false);
    if (apiKey && definition.usageImplemented) {
      refreshProvider(nextProvider.id);
    }
  };

  const updateProvider = (updated: ApiProviderConfig) => {
    const nextProviders = providers.map((provider) => (provider.id === updated.id ? updated : provider));
    saveAllProviders(nextProviders);
    setSelectedProvider(null);
    if (updated.apiKey && getProviderDefinition(updated.provider).usageImplemented) {
      refreshProvider(updated.id);
    }
  };

  const toggleProviderVisibility = (id: string) => {
    const nextProviders = providers.map((provider) => {
      if (provider.id !== id) return provider;

      const nextVisibility: ProviderVisibility = provider.visibility === 'hidden' ? 'visible' : 'hidden';

      return { ...provider, visibility: nextVisibility };
    });

    saveAllProviders(nextProviders);
  };

  const connectProvider = (provider: ApiProviderConfig) => {
    setSelectedProvider(provider);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.16),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_30%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-white/10 bg-[#171722]/90 p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">AI Operating Center</p>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Monitor de uso de APIs de IA</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
                Datos reales de saldo, coste y consumo de tus proveedores de API, más el % de uso de tus suscripciones Pro.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={() => setShowForm(true)}
                className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20"
              >
                + Añadir integración
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Ajustes del panel
              </button>
            </div>
          </div>

          {preferences.showSummaryCards && (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <SummaryCard title="Saldo total" value={`$${totalBalance.toFixed(2)}`} subtitle={`${visibleCount} proveedores activos`} />
              <SummaryCard title="Coste acumulado (7 días)" value={`$${totalCost.toFixed(2)}`} subtitle={`${connectedCount} conectados`} />
              <SummaryCard title="Tarjetas ocultas" value={`${hiddenCount}`} subtitle="Visibles en ajustes" />
            </div>
          )}
        </header>

        {showForm && (
          <AddProviderForm onSubmit={addProvider} onCancel={() => setShowForm(false)} />
        )}

        {settingsOpen && (
          <DashboardSettingsPanel
            preferences={preferences}
            onSave={(prefs) => saveAllPreferences(prefs)}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {selectedProvider && (
          <ProviderSettingsPanel
            provider={selectedProvider}
            onSave={updateProvider}
            onClose={() => setSelectedProvider(null)}
          />
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleProviders.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#151521]/90 p-8 text-center text-slate-300 shadow-2xl shadow-black/20">
              <p className="text-xl font-semibold text-white">No hay proveedores visibles</p>
              <p className="mt-2 text-sm text-slate-400">Activa &quot;Mostrar proveedores ocultos&quot; en ajustes o añade una nueva integración.</p>
            </div>
          ) : (
            visibleProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onConfigure={() => setSelectedProvider(provider)}
                onToggleVisibility={toggleProviderVisibility}
                onConnect={connectProvider}
                onRefresh={refreshProvider}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}
