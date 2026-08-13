'use strict';

// Todo el polling ocurre en el proceso principal, nunca en el renderer: el
// renderer del widget se carga con loadFile() (origen file://), y un fetch()
// cross-origin desde ahí contra http://127.0.0.1:3000 sería bloqueado por
// CORS salvo que tocáramos las rutas API existentes para añadir cabeceras
// (fuera de alcance). El fetch() global de Node en el proceso principal no
// tiene esa restricción.

async function fetchJson(url, options) {
  // cache: 'no-store' es obligatorio aquí: el fetch() del proceso principal
  // de Electron pasa por la caché HTTP de Chromium (persistida en
  // userData/Cache, sobrevive a reinicios de la app), y sin esto el widget
  // puede quedarse sirviendo una respuesta de /api/config o /api/usage
  // cacheada de un arranque anterior en vez de los datos reales actuales.
  const res = await fetch(url, { ...options, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function fetchDashboardSnapshot(serverUrl) {
  // DASHBOARD_CONFIG siempre guarda apiKey: '' (lib/storage.ts la sanea
  // antes de persistir) — la clave/cookie real vive aparte, en
  // DASHBOARD_PROVIDER_KEYS. app/page.tsx la rehidrata igual (envKeys[id]
  // ?? provider.apiKey ?? '') antes de decidir a quién consultar; hay que
  // replicar el mismo merge aquí o el widget nunca pediría datos reales.
  const [configRes, credentialStatus] = await Promise.all([
    fetchJson(`${serverUrl}/api/config`),
    fetchJson(`${serverUrl}/api/keys`),
  ]);
  const providers = configRes.providers || [];
  const configuredIds = new Set(credentialStatus.configuredIds || []);
  const withUsage = await Promise.all(
    providers.map(async (provider) => {
      const connected = configuredIds.has(provider.id);
      if (!connected) return { ...provider, apiKey: '', connected: false };
      try {
        const usage = await fetchJson(`${serverUrl}/api/usage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: provider.id, provider: provider.provider }),
        });
        return { ...provider, apiKey: '', connected: true, usage };
      } catch (err) {
        return {
          ...provider,
          apiKey: '',
          connected: true,
          usage: { fetchedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) },
        };
      }
    })
  );
  return { providers: withUsage, preferences: configRes.preferences };
}

// Tras un fallo (servidor reiniciando, blip de red durante una
// actualización, etc.) se reintenta pronto en vez de heredar el intervalo
// normal (5 min por defecto) — si no, el widget se queda con el banner
// "servidor no responde" y datos obsoletos hasta el siguiente ciclo
// completo, aunque el servidor ya haya vuelto a responder.
const RETRY_INTERVAL_MS = 15000;

function startUsagePolling({ serverUrl, onUpdate, onError, defaultIntervalMs = 300000, fetchSnapshot = fetchDashboardSnapshot }) {
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    let intervalMs = defaultIntervalMs;
    try {
      const snapshot = await fetchSnapshot(serverUrl);
      intervalMs = (snapshot.preferences?.refreshWidgetSeconds || 300) * 1000;
      onUpdate(snapshot);
    } catch (err) {
      if (onError) onError(err);
      intervalMs = Math.min(defaultIntervalMs, RETRY_INTERVAL_MS);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  }

  tick();
  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

// Añade/quita `id` de `preferences.widgetHiddenProviderIds` y lo persiste en
// el servidor. Es un read-modify-write porque PUT /api/config reemplaza
// `preferences` entero (no hace merge) — hay que partir del valor actual.
async function setProviderHidden(serverUrl, id, hidden) {
  const configRes = await fetchJson(`${serverUrl}/api/config`);
  const preferences = configRes.preferences || {};
  const current = new Set(preferences.widgetHiddenProviderIds || []);
  if (hidden) current.add(id);
  else current.delete(id);
  const nextPreferences = { ...preferences, widgetHiddenProviderIds: Array.from(current) };

  const res = await fetch(`${serverUrl}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences: nextPreferences }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} updating preferences`);
}

async function updatePreferences(serverUrl, patch) {
  const configRes = await fetchJson(`${serverUrl}/api/config`);
  const nextPreferences = { ...(configRes.preferences || {}), ...patch };
  const res = await fetch(`${serverUrl}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences: nextPreferences }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} updating preferences`);
  return nextPreferences;
}

module.exports = { fetchDashboardSnapshot, startUsagePolling, setProviderHidden, updatePreferences };
