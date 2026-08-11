'use strict';

// Todo el polling ocurre en el proceso principal, nunca en el renderer: el
// renderer del widget se carga con loadFile() (origen file://), y un fetch()
// cross-origin desde ahí contra http://127.0.0.1:3000 sería bloqueado por
// CORS salvo que tocáramos las rutas API existentes para añadir cabeceras
// (fuera de alcance). El fetch() global de Node en el proceso principal no
// tiene esa restricción.

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function fetchDashboardSnapshot(serverUrl) {
  const configRes = await fetchJson(`${serverUrl}/api/config`);
  const providers = configRes.providers || [];
  const withUsage = await Promise.all(
    providers.map(async (provider) => {
      if (!provider.apiKey) return provider;
      try {
        const usage = await fetchJson(`${serverUrl}/api/usage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: provider.id, provider: provider.provider }),
        });
        return { ...provider, usage };
      } catch (err) {
        return {
          ...provider,
          usage: { fetchedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) },
        };
      }
    })
  );
  return { providers: withUsage, preferences: configRes.preferences };
}

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
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  }

  tick();
  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = { fetchDashboardSnapshot, startUsagePolling };
