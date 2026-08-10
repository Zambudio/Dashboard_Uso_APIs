'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = Number(process.env.DASHBOARD_PORT) || 3000;
const HOST = process.env.DASHBOARD_HOST || '127.0.0.1';

// When packaged with pkg, `process.pkg` exists and process.execPath is the
// .exe itself, so the app directory is wherever the user placed the exe.
// When run directly with `node launcher.js` (dev/test), fall back to this
// file's own directory.
const appDir = process.pkg ? path.dirname(process.execPath) : __dirname;

const serverPath = path.join(appDir, 'standalone', 'server.js');
const entryPath = path.join(appDir, 'server-entry.js');
const envFile = path.join(appDir, '.env');

if (!fs.existsSync(serverPath)) {
  console.error('[dashboard] No se encuentra ' + serverPath);
  console.error('[dashboard] La carpeta "standalone" debe estar siempre junto a dashboard.exe.');
  process.exitCode = 1;
  return;
}

console.log('[dashboard] Arrancando servidor en http://' + HOST + ':' + PORT);
console.log('[dashboard] Archivo de claves: ' + envFile);

// Single-instance guard: if something is already listening on the port (a
// previous dashboard instance), don't spawn a second server — its child would
// fail to bind while still opening yet another browser tab. Instead open a tab
// to the already-running instance and exit, so N launches never create N tabs.

// One probe attempt; resolves `callback(true)` if something answered.
function probePort(callback) {
  const req = http.get(
    { host: HOST, port: PORT, path: '/', timeout: 800 },
    (res) => {
      res.resume();
      callback(true);
    }
  );
  req.on('timeout', () => {
    req.destroy();
    callback(false);
  });
  req.on('error', () => callback(false));
}

// Retry the probe a few times so we don't mistake a server that's still
// booting for "nobody home". Only when the port is genuinely free do we start.
function probeWithRetry(attempt, callback) {
  probePort((up) => {
    if (up) return callback(true);
    if (attempt >= 10) return callback(false);
    setTimeout(() => probeWithRetry(attempt + 1, callback), 300);
  });
}

function openBrowser() {
  const url = 'http://' + HOST + ':' + PORT;
  console.log('[dashboard] Panel listo en ' + url);

  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function waitForServer(attempt, callback) {
  const req = http.get({ host: HOST, port: PORT, path: '/', timeout: 1000 }, (res) => {
    res.resume();
    callback();
  });
  req.on('timeout', () => {
    req.destroy();
    retry(attempt, callback);
  });
  req.on('error', () => retry(attempt, callback));
}

function retry(attempt, callback) {
  if (attempt > 75) {
    console.error('[dashboard] El servidor no respondió tras 30s. Revisa que el puerto ' + PORT + ' esté libre.');
    return;
  }
  setTimeout(() => waitForServer(attempt + 1, callback), 400);
}

function startServer() {
  const child = spawn(
    process.execPath,
    // Spawns server-entry.js instead of server.js directly: pkg's Node runtime
    // has no inspector support AND doesn't support --require/NODE_OPTIONS
    // preloading, so server-entry.js requires inspector-shim.js itself before
    // requiring server.js, in the same process. Without this, Next.js's tracer
    // (loaded on the first server-side fetch(), e.g. /api/usage calling
    // provider APIs) crashes with ERR_INSPECTOR_NOT_AVAILABLE.
    [entryPath],
    {
      cwd: path.dirname(serverPath),
      env: Object.assign({}, process.env, {
        // Tells a pkg-built exe to run this script as plain `node <script>`
        // instead of re-launching the packaged snapshot. Harmless/no-op when
        // process.execPath is a normal Node.js binary (dev mode).
        PKG_EXECPATH: 'PKG_INVOKE_NODEJS',
        NODE_ENV: 'production',
        PORT: String(PORT),
        HOSTNAME: HOST,
        DASHBOARD_ENV_FILE: envFile,
      }),
      stdio: 'inherit',
    }
  );

  child.on('error', (err) => {
    console.error('[dashboard] No se pudo arrancar el servidor:', err.message);
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    process.exitCode = code === null ? 0 : code;
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  waitForServer(0, openBrowser);
}

// Entry point: single-instance check, then either reuse the running instance
// or spawn a fresh server.
probeWithRetry(0, (alreadyUp) => {
  if (alreadyUp) {
    console.log('[dashboard] Ya hay una instancia activa en el puerto ' + PORT + '. Abriendo pestaña y saliendo.');
    openBrowser();
    process.exit(0);
    return;
  }
  startServer();
});