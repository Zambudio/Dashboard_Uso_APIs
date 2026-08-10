'use client';

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddProviderForm } from '@/components/AddProviderForm';
import { BrowserLoginModal } from '@/components/BrowserLoginModal';
import { DashboardSettingsPanel } from '@/components/DashboardSettingsPanel';
import { ProviderCard } from '@/components/ProviderCard';
import { ProviderSettingsPanel } from '@/components/ProviderSettingsPanel';
import { fetchProviderUsage, loadEnvKeys, loadPreferences, loadProviders, savePreferences, saveProviders } from '@/lib/storage';
import { getProviderDefinition } from '@/lib/providers';
import { ApiProviderConfig, ApiUsageSnapshot, DashboardPreferences, ProviderKey, ProviderVisibility } from '@/types/api';

const initialProviders: ApiProviderConfig[] = [
  { id: 'openai', name: 'OpenAI / ChatGPT', provider: 'openai', kind: 'api', apiKey: '', status: 'unconfigured', visibility: 'visible' },
  { id: 'claude-pro', name: 'Claude Pro / Code', provider: 'claude-pro', kind: 'subscription', apiKey: '', status: 'unconfigured', visibility: 'visible' },
  { id: 'gemini', name: 'Google Gemini', provider: 'gemini', kind: 'api', apiKey: '', status: 'unconfigured', visibility: 'visible' },
  { id: 'anthropic', name: 'Anthropic Claude (API)', provider: 'anthropic', kind: 'api', apiKey: '', status: 'unconfigured', visibility: 'visible' },
  { id: 'deepseek', name: 'DeepSeek', provider: 'deepseek', kind: 'api', apiKey: '', status: 'unconfigured', visibility: 'visible' },
];

const defaultPreferences: DashboardPreferences = {
  showHiddenProviders: false,
  showSummaryCards: true,
  sortOrder: 'default',
};

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-card">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-semibold tabular text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

/** Reordena `list` moviendo `id` a la posición que hoy ocupa `overId`. */
function moveBefore(list: string[], id: string, overId: string): string[] {
  const from = list.indexOf(id);
  const to = list.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return list;
  const next = [...list];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export default function HomePage() {
  const [providers, setProviders] = useState<ApiProviderConfig[]>(initialProviders);
  const [preferences, setPreferences] = useState<DashboardPreferences>(defaultPreferences);
  const [showForm, setShowForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ApiProviderConfig | null>(null);
  const [browserLoginProvider, setBrowserLoginProvider] = useState<ApiProviderConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [initialLoadingIds, setInitialLoadingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = loadProviders();
    const storedPrefs = loadPreferences();

    if (stored.length) {
      // Ensure all standard providers are present
      const storedIds = new Set(stored.map((p) => p.id));
      const missingDefaults = initialProviders.filter((p) => !storedIds.has(p.id));
      const merged = [...stored, ...missingDefaults];
      setProviders(merged);
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

  // Refresco individual (botón "Actualizar" de una tarjeta, alta de proveedor, etc.):
  // se resuelve de forma independiente, no espera a nadie más.
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

  // Al cargar la página, todas las tarjetas conectadas se refrescan a la vez y
  // revelan sus datos juntas (nada de ir "apareciendo" una a una según responda cada API).
  useEffect(() => {
    loadEnvKeys().then((envKeys) => {
      setProviders((current) => {
        const merged = current.map((provider) => ({ ...provider, apiKey: envKeys[provider.id] ?? provider.apiKey ?? '' }));
        const toRefresh = merged.filter((provider) => provider.apiKey && getProviderDefinition(provider.provider).usageImplemented);

        if (toRefresh.length) {
          setInitialLoadingIds(new Set(toRefresh.map((p) => p.id)));
          Promise.all(
            toRefresh.map((provider) =>
              fetchProviderUsage(provider.id, provider.provider).then((snapshot) => ({ id: provider.id, snapshot }))
            )
          ).then((results) => {
            setProviders((latest) => {
              const byId = new Map(results.map((r) => [r.id, r.snapshot]));
              const next = latest.map((provider) => {
                const snapshot = byId.get(provider.id);
                if (!snapshot) return provider;
                return { ...provider, usage: snapshot, status: snapshot.error ? ('error' as const) : ('online' as const) };
              });
              saveProviders(next);
              return next;
            });
            setInitialLoadingIds(new Set());
          });
        }

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
      default: {
        const order = preferences.cardOrder;
        if (!order?.length) return filtered;
        const indexOf = new Map(order.map((id, i) => [id, i]));
        return [...filtered].sort((a, b) => (indexOf.get(a.id) ?? Infinity) - (indexOf.get(b.id) ?? Infinity));
      }
    }
  }, [preferences, providers]);

  // --- Arrastrar para reordenar --------------------------------------------
  const baseOrder = useMemo(() => visibleProviders.map((p) => p.id), [visibleProviders]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragIdRef = useRef<string | null>(null);

  const displayOrder = liveOrder ?? baseOrder;
  const displayProviders = useMemo(
    () => displayOrder.map((id) => visibleProviders.find((p) => p.id === id)).filter((p): p is ApiProviderConfig => Boolean(p)),
    [displayOrder, visibleProviders]
  );

  const commitOrder = useCallback(
    (order: string[]) => {
      const hiddenIds = providers.map((p) => p.id).filter((id) => !order.includes(id));
      const nextPrefs: DashboardPreferences = { ...preferences, sortOrder: 'default', cardOrder: [...order, ...hiddenIds] };
      setPreferences(nextPrefs);
      savePreferences(nextPrefs);
    },
    [preferences, providers]
  );

  useEffect(() => {
    if (!dragId) return;

    const handleMove = (event: PointerEvent) => {
      const { clientX, clientY } = event;
      let hoveredId: string | null = null;
      cardRefs.current.forEach((el, id) => {
        if (hoveredId || id === dragIdRef.current) return;
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          hoveredId = id;
        }
      });
      if (hoveredId) {
        setLiveOrder((current) => moveBefore(current ?? baseOrder, dragIdRef.current!, hoveredId!));
      }
    };

    const stopDragging = () => {
      setLiveOrder((current) => {
        if (current) commitOrder(current);
        return null;
      });
      setDragId(null);
      dragIdRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId, baseOrder, commitOrder]);

  const startDrag = (id: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragIdRef.current = id;
    setDragId(id);
    setLiveOrder(baseOrder);
  };
  // --------------------------------------------------------------------------

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
      status: apiKey ? 'online' : 'unconfigured',
      visibility: 'visible',
    };

    saveAllProviders([nextProvider, ...providers]);
    setShowForm(false);
    if (apiKey && definition.usageImplemented) {
      refreshProvider(nextProvider.id);
    }
  };

  const handleStartBrowserLoginNew = (name: string, provider: ProviderKey) => {
    const definition = getProviderDefinition(provider);
    const nextProvider: ApiProviderConfig = {
      id: `${provider}-${Date.now()}`,
      name,
      provider,
      kind: definition.kind,
      apiKey: '',
      status: 'unconfigured',
      visibility: 'visible',
    };

    saveAllProviders([nextProvider, ...providers]);
    setShowForm(false);
    setBrowserLoginProvider(nextProvider);
  };

  const updateProvider = (updated: ApiProviderConfig) => {
    const nextProviders = providers.map((provider) => (provider.id === updated.id ? updated : provider));
    saveAllProviders(nextProviders);
    setSelectedProvider(null);
    if (updated.apiKey && getProviderDefinition(updated.provider).usageImplemented) {
      refreshProvider(updated.id);
    }
  };

  const handleBrowserLoginSuccess = async (providerId: string, snapshot: ApiUsageSnapshot) => {
    const envKeys = await loadEnvKeys();
    setProviders((current) => {
      const next = current.map((p) => {
        if (p.id === providerId) {
          return {
            ...p,
            apiKey: envKeys[providerId] || 'connected-session',
            status: 'online' as const,
            usage: snapshot,
          };
        }
        return p;
      });
      saveProviders(next);
      return next;
    });
    setBrowserLoginProvider(null);
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.14),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_30%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-white/10 bg-[#171722]/90 p-6 shadow-card">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Monitor de uso de APIs de IA</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
                Datos reales de saldo, coste y consumo de tus proveedores de API, con inicio de sesión web automático para Claude, ChatGPT y Gemini.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={() => setShowForm(true)}
                className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              >
                + Añadir integración
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
          <AddProviderForm
            onSubmit={addProvider}
            onCancel={() => setShowForm(false)}
            onBrowserLogin={handleStartBrowserLoginNew}
          />
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
            onBrowserLogin={(p) => {
              setSelectedProvider(null);
              setBrowserLoginProvider(p);
            }}
          />
        )}

        {browserLoginProvider && (
          <BrowserLoginModal
            provider={browserLoginProvider}
            onSuccess={handleBrowserLoginSuccess}
            onClose={() => setBrowserLoginProvider(null)}
          />
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayProviders.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#151521]/90 p-8 text-center text-slate-300 shadow-card">
              <p className="text-xl font-semibold text-white">No hay proveedores visibles</p>
              <p className="mt-2 text-sm text-slate-400">Activa &quot;Mostrar proveedores ocultos&quot; en ajustes o añade una nueva integración.</p>
            </div>
          ) : (
            displayProviders.map((provider) => (
              <div
                key={provider.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(provider.id, el);
                  else cardRefs.current.delete(provider.id);
                }}
                className={`transition-transform duration-200 ease-out ${dragId === provider.id ? 'z-10 scale-[1.02]' : ''}`}
              >
                <ProviderCard
                  provider={provider}
                  onConfigure={() => setSelectedProvider(provider)}
                  onToggleVisibility={toggleProviderVisibility}
                  onConnect={connectProvider}
                  onRefresh={refreshProvider}
                  onBrowserLogin={(p) => setBrowserLoginProvider(p)}
                  loading={initialLoadingIds.has(provider.id)}
                  dragHandleProps={{ onPointerDown: startDrag(provider.id) }}
                  isDragging={dragId === provider.id}
                />
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
