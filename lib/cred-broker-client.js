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
  const res = await fetchImpl(`${broker.url}/credentials`, {
    headers: { Authorization: `Bearer ${broker.token}` },
  });
  if (!res.ok) throw new Error(`credential broker GET failed: HTTP ${res.status}`);
  return res.json();
}

async function writeKeysToBroker(broker, keys, fetchImpl = fetch) {
  const res = await fetchImpl(`${broker.url}/credentials`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${broker.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(keys),
  });
  if (!res.ok) throw new Error(`credential broker PUT failed: HTTP ${res.status}`);
}

module.exports = { resolveBrokerConfig, readKeysFromBroker, writeKeysToBroker };
