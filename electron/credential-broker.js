'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { createCredentialStore, migrateFromLegacyEnv, removeLegacyEnvKeys } = require('./lib/credential-store');

// Arranca un servidor HTTP solo-loopback que hace de intermediario para leer
// y escribir credenciales cifradas: el servidor Next.js (proceso Node hijo
// aparte) no puede llamar a safeStorage directamente porque no es un proceso
// Electron. El token evita que cualquier otro proceso local que adivine el
// puerto pueda leer secretos.
function startCredentialBroker({ safeStorage, filePath, legacyEnvPath, configStore }) {
  const store = createCredentialStore({ safeStorage, filePath });
  const token = crypto.randomBytes(24).toString('hex');

  // Importación única: si no hay almacén cifrado todavía pero existe un
  // .env antiguo con DASHBOARD_PROVIDER_KEYS, se usa para sembrar el
  // almacén cifrado, así quien actualiza no pierde proveedores ya conectados.
  const existing = store.load();
  if (Object.keys(existing).length === 0 && legacyEnvPath) {
    const legacy = migrateFromLegacyEnv(legacyEnvPath);
    if (legacy && Object.keys(legacy).length > 0) {
      store.save(legacy);
      removeLegacyEnvKeys(legacyEnvPath);
    }
  }

  if (configStore && legacyEnvPath && fs.existsSync(legacyEnvPath) && !configStore.has('dashboardState')) {
    const raw = fs.readFileSync(legacyEnvPath, 'utf8');
    const decode = (name) => {
      const match = raw.split(/\r?\n/).map((line) => line.match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\r\\n]*)"?\\s*$`))).find(Boolean);
      if (!match || !match[1]) return null;
      try { return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')); } catch { return null; }
    };
    const providers = decode('DASHBOARD_CONFIG');
    const preferences = decode('DASHBOARD_PREFERENCES');
    if (providers || preferences) configStore.set('dashboardState', { providers, preferences });
  }

  function authorized(req) {
    return (req.headers['authorization'] || '') === `Bearer ${token}`;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1024 * 1024) {
          reject(new Error('payload too large'));
          req.destroy();
        }
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  const server = http.createServer((req, res) => {
    if (req.url !== '/credentials' && req.url !== '/config') {
      res.writeHead(404).end();
      return;
    }
    if (!authorized(req)) {
      res.writeHead(401).end();
      return;
    }
    if (req.method === 'GET') {
      const value = req.url === '/credentials'
        ? store.load()
        : (configStore?.get('dashboardState', { providers: null, preferences: null }) ?? { providers: null, preferences: null });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
      return;
    }
    if (req.method === 'PUT') {
      readBody(req).then((body) => {
        try {
          const value = JSON.parse(body || '{}');
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid payload');
          if (req.url === '/credentials') {
            const valid = Object.entries(value).every(([id, secret]) => /^[a-z0-9][a-z0-9-]{0,127}$/i.test(id) && typeof secret === 'string' && secret.length <= 250000);
            if (!valid) throw new Error('invalid credentials');
            store.save(value);
          } else {
            if (!configStore) throw new Error('config store unavailable');
            const current = configStore.get('dashboardState', { providers: null, preferences: null });
            configStore.set('dashboardState', { ...current, ...value });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400).end();
        }
      });
      return;
    }
    res.writeHead(405).end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        token,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

module.exports = { startCredentialBroker };
