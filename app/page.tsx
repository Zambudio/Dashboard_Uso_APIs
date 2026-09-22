'use client';

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddProviderForm } from '@/components/AddProviderForm';
import { BrowserLoginModal } from '@/components/BrowserLoginModal';
import { DashboardSettingsPanel } from '@/components/DashboardSettingsPanel';
import { ProviderCard } from '@/components/ProviderCard';
import { ProviderSettingsPanel } from '@/components/ProviderSettingsPanel';
import {
  deleteProviderCredentials,
  fetchCredentialStatus,
  fetchProviderUsage,
  fetchServerConfig,
  fetchSyncedCache,
  savePreferences,
  saveProviderCredential,
  saveProviders,
} from '@/lib/storage';
import { SyncModal } from '@/components/SyncModal';
import { getProviderDefinition } from '@/lib/providers';
import {
  ApiProviderConfig,
  ApiUsageSnapshot,
  DashboardPreferences,
  ProviderKey,
  ProviderVisibility,
} from '@/types/api';

const initialProviders: ApiProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI / ChatGPT',
    provider: 'openai',
    kind: 'api',
    apiKey: '',
    status: 'unconfigured',
    visibility: 'visible',
  },
  {
    id: 'claude-pro',
    name: 'Claude Pro / Code',
    provider: 'claude-pro',
    kind: 'subscription',
    apiKey: '',
    status: 'unconfigured',
    visibility: 'visible',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    provider: 'gemini',
    kind: 'subscription',
    apiKey: '',
    status: 'unconfigured',
    visibility: 'visible',
  },

  {
    id: 'anthropic',
    name: 'Anthropic Claude (API)',
    provider: 'anthropic',
    kind: 'api',
    apiKey: '',
    status: 'unconfigured',
    visibility: 'visible',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'deepseek',
    kind: 'api',
    apiKey: '',
    status: 'unconfigured',
    visibility: 'visible',
  },
];

const defaultPreferences: DashboardPreferences = {
  showHiddenProviders: false,
  showSummaryCards: true,
  sortOrder: 'default',
  refreshWidgetSeconds: 300,
  widgetOpacity: 92,
  widgetHiddenProviderIds: [],
  widgetTheme: 'aurora',
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
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [initialLoadingIds, setInitialLoadingIds] = useState<Set<string>>(new Set());
  const [detecting, setDetecting] = useState(false);
  const [detectNotification, setDetectNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  // La carga inicial (config + claves + uso por proveedor) es asíncrona y el
  // último paso puede tardar varios segundos porque llama a APIs externas
  // reales. Si el usuario edita la lista de proveedores (p.ej. borra una
  // tarjeta) mientras tanto, esta bandera evita que loadData() sobrescriba
  // ese cambio — y lo que persiste en disco — cuando termine de cargar.
  const providersEditedRef = useRef(false);

  useEffect(() => {
    async function loadData() {
      // 1. Get configs, keys and synced usage cache
      const [serverConfig, configuredIds, syncedCache] = await Promise.all([
        fetchServerConfig(),
        fetchCredentialStatus(),
        fetchSyncedCache(),
      ]);

      // 2. Resolve preferences
      const effectivePrefs = serverConfig.preferences || defaultPreferences;
      setPreferences(effectivePrefs);

      // 3. Resolve providers
      const effectiveProviders = serverConfig.providers || [];
      let baseProviders = effectiveProviders.length > 0 ? effectiveProviders : initialProviders;

      const storedIds = new Set(baseProviders.map((p) => p.id));
      const deletedDefaultIds = new Set(effectivePrefs.deletedDefaultProviderIds ?? []);
      const missingDefaults = initialProviders.filter((p) => !storedIds.has(p.id) && !deletedDefaultIds.has(p.id));
      baseProviders = [...baseProviders, ...missingDefaults];

      if (effectiveProviders.length === 0) {
        saveProviders(baseProviders);
      }

      // 4. Merge credential presence and synced browser data
      const providersWithStatus = baseProviders.map((provider) => {
        const cached = syncedCache[provider.id]?.snapshot || syncedCache[provider.provider]?.snapshot;
        const hasCred = configuredIds.has(provider.id);
        const definition = getProviderDefinition(provider.provider);
        return {
          ...provider,
          kind: definition.kind,
          apiKey: '',
          connected: hasCred || Boolean(cached),
          usage: cached || provider.usage,
          status: cached ? ('online' as const) : hasCred ? ('online' as const) : ('unconfigured' as const),
        };
      });


      // 5. Fetch usage for providers with credentials configured
      const toRefresh = providersWithStatus.filter(
        (provider) => configuredIds.has(provider.id) && getProviderDefinition(provider.provider).usageImplemented
      );

      if (toRefresh.length) {
        setInitialLoadingIds(new Set(toRefresh.map((p) => p.id)));
        if (!providersEditedRef.current) setProviders(providersWithStatus);
        const results = await Promise.all(
          toRefresh.map((provider) =>
            fetchProviderUsage(provider.id, provider.provider).then((snapshot) => ({ id: provider.id, snapshot }))
          )
        );
        const byId = new Map(results.map((r) => [r.id, r.snapshot]));

        if (providersEditedRef.current) {
          setProviders((current) => {
            const next = current.map((provider) => {
              const snapshot = byId.get(provider.id);
              if (!snapshot) return provider;
              return {
                ...provider,
                usage: snapshot,
                status: snapshot.error ? ('error' as const) : ('online' as const),
              };
            });
            saveProviders(next);
            return next;
          });
        } else {
          const finalProviders = providersWithStatus.map((provider) => {
            const snapshot = byId.get(provider.id);
            if (!snapshot) return provider;
            return { ...provider, usage: snapshot, status: snapshot.error ? ('error' as const) : ('online' as const) };
          });
          setProviders(finalProviders);
          saveProviders(finalProviders);
        }
        setInitialLoadingIds(new Set());
      } else if (!providersEditedRef.current) {
        setProviders(providersWithStatus);
      }
    }

    loadData();
  }, []);

  // Polling automático cada 10s para reflejar sincronizaciones desde la extensión o bookmarklet
  useEffect(() => {
    const interval = setInterval(async () => {
      const synced = await fetchSyncedCache();
      if (!synced || Object.keys(synced).length === 0) return;
      setProviders((current) => {
        let changed = false;
        const next = current.map((p) => {
          const cached = synced[p.id]?.snapshot || synced[p.provider]?.snapshot;
          if (cached && (!p.usage || p.usage.fetchedAt !== cached.fetchedAt)) {
            changed = true;
            return {
              ...p,
              connected: true,
              usage: cached,
              status: 'online' as const,
            };
          }
          return p;
        });
        return changed ? next : current;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const saveAllProviders = useCallback((updated: ApiProviderConfig[]) => {
    const normalized = updated.map((provider) => ({ ...provider, apiKey: '' }));
    providersEditedRef.current = true;
    setProviders(normalized);
    return saveProviders(normalized);
  }, []);

  // Refresco individual (botón "Actualizar" de una tarjeta, alta de proveedor, etc.):
  // se resuelve de forma independiente, no espera a nadie más.
  const refreshProvider = useCallback(async (id: string) => {
    setProviders((current) => {
      const target = current.find((provider) => provider.id === id);
      if (!target || !target.connected) return current;

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

  const refreshAll = useCallback(async () => {
    const synced = await fetchSyncedCache();
    setProviders((current) => {
      const next = current.map((p) => {
        const cached = synced[p.id]?.snapshot || synced[p.provider]?.snapshot;
        if (cached) {
          return {
            ...p,
            connected: true,
            usage: cached,
            status: 'online' as const,
          };
        }
        return p;
      });
      return next;
    });

    setProviders((current) => {
      current.forEach((p) => {
        if (p.connected) {
          void refreshProvider(p.id);
        }
      });
      return current;
    });
  }, [refreshProvider]);

  const handleAutoDetect = async () => {
    setDetecting(true);
    setDetectNotification(null);
    try {
      const res = await fetch('/api/subscriptions/auto-detect', { method: 'POST' });
      const data = await res.json();
      if (data.providers) {
        setProviders(data.providers);
      }
      const syncKeys = Object.keys(data.syncResults || {});
      const successful = syncKeys.filter((k) => data.syncResults[k]?.success);
      if (successful.length > 0) {
        const names = successful.map((k) => {
          if (k === 'claude') return 'Claude Pro / Code';
          if (k === 'openai') return 'ChatGPT Plus / Codex';
          if (k === 'gemini') return 'Google AI Pro (Antigravity)';
          return k;
        });
        setDetectNotification({
          type: 'success',
          message: `¡Suscripciones locales detectadas y sincronizadas con éxito: ${names.join(', ')}!`,
        });
      } else {
        setDetectNotification({
          type: 'info',
          message: 'No se encontraron nuevas suscripciones locales en ~/.claude o ~/.codex.',
        });
      }
      void refreshAll();
    } catch {
      setDetectNotification({
        type: 'error',
        message: 'Error al conectar con el detector de suscripciones locales.',
      });
    } finally {
      setDetecting(false);
      setTimeout(() => setDetectNotification(null), 6000);
    }
  };

  const totalBalance = useMemo(
    () =>
      providers
        .filter(
          (item) =>
            item.visibility !== 'hidden' &&
            item.kind === 'api' &&
            item.provider !== 'gemini' &&
            item.provider !== 'claude-pro' &&
            item.usage?.currency !== 'créditos'
        )
        .reduce((sum, item) => sum + (item.usage?.balance ?? 0), 0),
    [providers]
  );


  const totalCost = useMemo(
    () => providers.reduce((sum, item) => sum + (item.usage?.accumulatedCost ?? 0), 0),
    [providers]
  );
  const visibleCount = useMemo(
    () => providers.filter((provider) => provider.visibility !== 'hidden').length,
    [providers]
  );
  const hiddenCount = useMemo(
    () => providers.filter((provider) => provider.visibility === 'hidden').length,
    [providers]
  );
  const connectedCount = useMemo(
    () => providers.filter((provider) => provider.connected && provider.visibility !== 'hidden').length,
    [providers]
  );

  const visibleProviders = useMemo(() => {
    const filtered = providers.filter(
      (provider) => preferences.showHiddenProviders || provider.visibility !== 'hidden'
    );
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
    () =>
      displayOrder
        .map((id) => visibleProviders.find((p) => p.id === id))
        .filter((p): p is ApiProviderConfig => Boolean(p)),
    [displayOrder, visibleProviders]
  );

  const commitOrder = useCallback(
    (order: string[]) => {
      const hiddenIds = providers.map((p) => p.id).filter((id) => !order.includes(id));
      const nextPrefs: DashboardPreferences = {
        ...preferences,
        sortOrder: 'default',
        cardOrder: [...order, ...hiddenIds],
      };
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

  const addProvider = async (name: string, provider: ProviderKey, apiKey: string) => {
    const definition = getProviderDefinition(provider);
    const nextProvider: ApiProviderConfig = {
      id: `${provider}-${Date.now()}`,
      name,
      provider,
      kind: definition.kind,
      apiKey: '',
      connected: Boolean(apiKey),
      status: apiKey ? 'online' : 'unconfigured',
      visibility: 'visible',
    };

    if (apiKey) await saveProviderCredential(nextProvider.id, apiKey);
    await saveAllProviders([nextProvider, ...providers]);
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

  const updateProvider = async (updated: ApiProviderConfig) => {
    const newSecret = updated.apiKey.trim();
    if (newSecret) await saveProviderCredential(updated.id, newSecret);
    const safeUpdated = { ...updated, apiKey: '', connected: newSecret ? true : updated.connected };
    const nextProviders = providers.map((provider) => (provider.id === safeUpdated.id ? safeUpdated : provider));
    await saveAllProviders(nextProviders);
    setSelectedProvider(null);
    if (safeUpdated.connected && getProviderDefinition(safeUpdated.provider).usageImplemented) {
      refreshProvider(safeUpdated.id);
    }
  };

  const handleBrowserLoginSuccess = async (providerId: string, snapshot: ApiUsageSnapshot) => {
    providersEditedRef.current = true;
    setProviders((current) => {
      const next = current.map((p) => {
        if (p.id === providerId) {
          return {
            ...p,
            apiKey: '',
            connected: true,
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

  const removeProvider = (id: string) => {
    const nextProviders = providers.filter((provider) => provider.id !== id);
    saveAllProviders(nextProviders);

    const isDefault = initialProviders.some((provider) => provider.id === id);
    if (isDefault) {
      const nextPrefs: DashboardPreferences = {
        ...preferences,
        deletedDefaultProviderIds: [...(preferences.deletedDefaultProviderIds ?? []), id],
      };
      saveAllPreferences(nextPrefs);
    }

    void deleteProviderCredentials([id]);
    setSelectedProvider(null);
  };

  const connectProvider = (provider: ApiProviderConfig) => {
    setSelectedProvider(provider);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.14),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_30%)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* Barra superior compacta con acciones rápidas */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#171722]/80 px-5 py-3 shadow-card backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img src="/app-icon.png" alt="Logo" className="h-8 w-8 rounded-lg shadow-sm" />
            <span className="text-lg font-bold tracking-tight text-white">Monitor APIs</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => void handleAutoDetect()}
              disabled={detecting}
              title="Detecta automáticamente cuentas de Claude Code, ChatGPT Plus / Codex y Gemini en tu equipo"
              className="flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-gradient-to-r from-emerald-500/25 to-teal-500/25 px-3.5 py-1.5 text-xs font-bold text-emerald-300 shadow-lg shadow-emerald-500/10 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
            >
              <span className={detecting ? 'inline-block animate-spin' : ''}>⚡</span>
              <span>{detecting ? 'Detectando suscripciones...' : 'Auto-detectar Suscripciones'}</span>
            </button>
            <button
              onClick={() => setSyncModalOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 px-3.5 py-1.5 text-xs font-bold text-cyan-300 shadow-lg shadow-cyan-500/10 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <span>🌐</span>
              <span>Sincronizar Navegador</span>
            </button>
            <button
              onClick={() => void refreshAll()}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span>↻</span>
              <span>Actualizar todo</span>
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              + Añadir IA
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              Ajustes
            </button>
          </div>
        </div>

        {detectNotification && (
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm backdrop-blur-sm transition ${
              detectNotification.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : detectNotification.type === 'error'
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
            }`}
          >
            <span>{detectNotification.message}</span>
            <button
              onClick={() => setDetectNotification(null)}
              className="ml-3 text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

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
            providers={providers}
            onSave={(prefs) => saveAllPreferences(prefs)}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {selectedProvider && (
          <ProviderSettingsPanel
            provider={selectedProvider}
            onSave={updateProvider}
            onDelete={removeProvider}
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

        {/* SECCIÓN PRINCIPAL: TARJETAS DE PROVEEDORES ARRIBA */}
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 items-stretch">
          {displayProviders.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#151521]/90 p-8 text-center text-slate-300 shadow-card col-span-full">
              <p className="text-xl font-semibold text-white">No hay proveedores visibles</p>
              <p className="mt-2 text-sm text-slate-400">
                Activa &quot;Mostrar proveedores ocultos&quot; en ajustes o añade una nueva integración.
              </p>
            </div>
          ) : (
            displayProviders.map((provider) => (
              <div
                key={provider.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(provider.id, el);
                  else cardRefs.current.delete(provider.id);
                }}
                className={`h-full transition-transform duration-200 ease-out ${dragId === provider.id ? 'z-10 scale-[1.02]' : ''}`}
              >
                <ProviderCard
                  provider={provider}
                  onConfigure={() => setSelectedProvider(provider)}
                  onToggleVisibility={toggleProviderVisibility}
                  onConnect={connectProvider}
                  onRefresh={refreshProvider}
                  onOpenSync={() => setSyncModalOpen(true)}
                  onBrowserLogin={(p) => setBrowserLoginProvider(p)}
                  loading={initialLoadingIds.has(provider.id)}
                  dragHandleProps={{ onPointerDown: startDrag(provider.id) }}
                  isDragging={dragId === provider.id}
                />
              </div>
            ))
          )}
        </section>

        {/* BLOQUE INFORMATIVO Y RESUMEN EN LA PARTE INFERIOR */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#171722]/90 p-6 shadow-card">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Monitor de uso de APIs de IA</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Datos reales de saldo, coste y consumo de tus proveedores de API, con sincronización de navegador
                para Claude, ChatGPT, Antigravity y Gemini.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setSyncModalOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 px-3.5 py-1.5 text-xs font-bold text-cyan-300 shadow-lg shadow-cyan-500/10 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <span>⚡</span>
                <span>Sincronizar Navegador</span>
              </button>
              <button
                onClick={() => void refreshAll()}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
              >
                <span>↻</span>
                <span>Actualizar todo</span>
              </button>
            </div>
          </div>

          {preferences.showSummaryCards && (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <SummaryCard
                title="Saldo total"
                value={`$${totalBalance.toFixed(2)}`}
                subtitle={`${visibleCount} proveedores activos`}
              />
              <SummaryCard
                title="Coste acumulado (7 días)"
                value={`$${totalCost.toFixed(2)}`}
                subtitle={`${connectedCount} conectados`}
              />
              <SummaryCard title="Tarjetas ocultas" value={`${hiddenCount}`} subtitle="Visibles en ajustes" />
            </div>
          )}
        </div>


        <SyncModal
          isOpen={syncModalOpen}
          onClose={() => setSyncModalOpen(false)}
          onRefreshAll={refreshAll}
        />
      </div>
    </main>
  );
}
