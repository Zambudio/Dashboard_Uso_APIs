'use strict';

const http = require('http');
const crypto = require('crypto');
const { createCredentialStore, migrateFromLegacyEnv } = require('./lib/credential-store');

// Arranca un servidor HTTP solo-loopback que hace de intermediario para leer
// y escribir credenciales cifradas: el servidor Next.js (proceso Node hijo
// aparte) no puede llamar a safeStorage directamente porque no es un proceso
// Electron. El token evita que cualquier otro proceso local que adivine el
// puerto pueda leer secretos.
function startCredentialBroker({ safeStorage, filePath, legacyEnvPath }) {
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
    }
  }

  function authorized(req) {
    return (req.headers['authorization'] || '') === `Bearer ${token}`;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  const server = http.createServer((req, res) => {
    if (req.url !== '/credentials') {
      res.writeHead(404).end();
      return;
    }
    if (!authorized(req)) {
      res.writeHead(401).end();
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(store.load()));
      return;
    }
    if (req.method === 'PUT') {
      readBody(req).then((body) => {
        try {
          const keys = JSON.parse(body || '{}');
          store.save(keys);
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
