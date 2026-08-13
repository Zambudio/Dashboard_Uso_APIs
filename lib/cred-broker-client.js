'use strict';

// Módulo puro consumido por lib/env-keys.server.ts: decide si las claves de
// proveedor deben leerse/escribirse a través del broker de credenciales de
// Electron (widget empaquetado) o del .env heredado (`next dev` sin
// Electron). Se mantiene en JS plano (no .ts) para poder probarlo con
// `node --test` sin depender de un runner de TypeScript.

function resolveBrokerConfig(env) {
  const url = env.DASHBOARD_CRED_BROKER_URL;
  const token = env.DASHBOARD_CRED_BROKER_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function readKeysFromBroker(broker, fetchImpl = fetch) {
  // cache: 'no-store' es obligatorio: este fetch() se ejecuta dentro de un
  // Route Handler de Next.js, que instrumenta el fetch global y cachea la
  // respuesta indefinidamente (independientemente de `export const dynamic
  // = 'force-dynamic'` en la propia ruta, que solo controla el renderizado
  // de la ruta, no el caché de sus fetch() internos). Sin esto, la primera
  // lectura del proceso queda "congelada" para siempre: cualquier escritura
  // posterior al broker (login de un proveedor, refresco de sesión de
  // DeepSeek) nunca se refleja en GET /api/keys, y un PUT que primero hace
  // "leer todo + fusionar + escribir todo" acaba revirtiendo silenciosamente
  // esas escrituras porque fusiona contra esa foto congelada, no contra el
  // estado real en disco.
  const res = await fetchImpl(`${broker.url}/credentials`, {
    headers: { Authorization: `Bearer ${broker.token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`credential broker GET failed: HTTP ${res.status}`);
  return res.json();
}

async function writeKeysToBroker(broker, keys, fetchImpl = fetch) {
  const res = await fetchImpl(`${broker.url}/credentials`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${broker.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(keys),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`credential broker PUT failed: HTTP ${res.status}`);
}

async function readConfigFromBroker(broker, fetchImpl = fetch) {
  const res = await fetchImpl(`${broker.url}/config`, {
    headers: { Authorization: `Bearer ${broker.token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`local broker config GET failed: HTTP ${res.status}`);
  return res.json();
}

async function writeConfigToBroker(broker, config, fetchImpl = fetch) {
  const res = await fetchImpl(`${broker.url}/config`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${broker.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`local broker config PUT failed: HTTP ${res.status}`);
}

module.exports = { resolveBrokerConfig, readKeysFromBroker, writeKeysToBroker, readConfigFromBroker, writeConfigToBroker };
