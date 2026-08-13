'use strict';

const path = require('path');
const http = require('http');

function probePort(host, port, timeoutMs = 800, probePath = '/') {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: probePath, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// El path por defecto es una ruta API dinámica (no la '/' estática) a
// propósito: en el standalone de Next.js, '/' está pre-renderizada y
// responde en cuanto el socket acepta conexiones, mientras que las rutas
// dinámicas (force-dynamic, como /api/config) se inicializan de forma
// perezosa en su primera petición. Si el sondeo solo comprobara '/', el
// primer sondeo real del widget (electron/usage-poller.js) sería el que
// paga ese coste de arranque y puede recibir una respuesta vacía/parcial.
async function waitForServer(host, port, { retries = 75, delayMs = 400, probePath = '/api/config' } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await probePort(host, port, 800, probePath)) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

// standaloneDir debe contener server-entry.js, inspector-shim.js y
// standalone/server.js (ver scripts/prepare-standalone.js).
// El paquete Electron usa utilityProcess.fork: proporciona un runtime Node
// aislado sin habilitar ELECTRON_RUN_AS_NODE en el ejecutable distribuido.
function spawnServer({ standaloneDir, port, host, envFile, forkProcess, brokerUrl, brokerToken, onExit }) {
  const entryPath = path.join(standaloneDir, 'server-entry.js');
  if (typeof forkProcess !== 'function') {
    throw new TypeError('forkProcess es obligatorio para iniciar el servidor.');
  }
  const childEnv = Object.assign({}, process.env, {
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: host,
    DASHBOARD_ENV_FILE: envFile,
    DASHBOARD_CRED_BROKER_URL: brokerUrl,
    DASHBOARD_CRED_BROKER_TOKEN: brokerToken,
  });
  delete childEnv.ELECTRON_RUN_AS_NODE;
  delete childEnv.NODE_OPTIONS;
  const child = forkProcess(entryPath, [], {
    cwd: path.join(standaloneDir, 'standalone'),
    env: childEnv,
    stdio: 'inherit',
  });
  child.on('exit', (code) => { if (onExit) onExit(code); });
  return child;
}

module.exports = { probePort, waitForServer, spawnServer };
