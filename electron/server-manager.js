'use strict';

const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

function probePort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitForServer(host, port, { retries = 75, delayMs = 400 } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await probePort(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

// standaloneDir debe contener server-entry.js, inspector-shim.js y
// standalone/server.js (ver scripts/prepare-standalone.js).
// Se lanza con ELECTRON_RUN_AS_NODE=1 para reutilizar el propio binario de
// Electron (process.execPath) como runtime Node del proceso hijo, sin
// depender de que el usuario tenga Node.js instalado ni de pkg.
function spawnServer({ standaloneDir, port, host, envFile, execPath, brokerUrl, brokerToken, onExit }) {
  const entryPath = path.join(standaloneDir, 'server-entry.js');
  const child = spawn(execPath, [entryPath], {
    cwd: path.join(standaloneDir, 'standalone'),
    env: Object.assign({}, process.env, {
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: host,
      DASHBOARD_ENV_FILE: envFile,
      DASHBOARD_CRED_BROKER_URL: brokerUrl,
      DASHBOARD_CRED_BROKER_TOKEN: brokerToken,
    }),
    stdio: 'inherit',
  });
  child.on('exit', (code) => { if (onExit) onExit(code); });
  return child;
}

module.exports = { probePort, waitForServer, spawnServer };
