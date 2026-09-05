'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const HOSTNAME = '127.0.0.1';
const PORT = 3100;

function getJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = body ? JSON.parse(body) : null;
        } catch {
          /* non-JSON body */
        }
        resolve({ status: res.statusCode, body: parsed, raw: body });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Timeout consultando ${url}`)));
    req.on('error', reject);
  });
}

async function waitForServer(url, retries = 30, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await getJson(url);
      if (res.status === 200) return res;
    } catch {
      /* server not up yet */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`El servidor standalone no respondió en ${url}`);
}

async function main() {
  const standaloneDir = path.resolve(process.cwd(), '.next', 'standalone');
  const serverFile = path.join(standaloneDir, 'server.js');
  if (!fs.existsSync(serverFile)) {
    throw new Error('Crea primero el standalone con `npm run build` antes de ejecutar `npm run smoke`.');
  }

  const child = spawn(process.execPath, [serverFile], {
    cwd: standaloneDir,
    env: { ...process.env, PORT: String(PORT), HOSTNAME, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d.toString()));

  const shutdown = () => {
    try {
      child.kill();
    } catch {
      /* already exited */
    }
  };

  try {
    await waitForServer(`http://${HOSTNAME}:${PORT}/api/health`);

    const health = await getJson(`http://${HOSTNAME}:${PORT}/api/health`);
    if (health.status !== 200 || health.body?.ok !== true) {
      throw new Error(`/api/health inesperado: ${JSON.stringify(health)}`);
    }

    const keys = await getJson(`http://${HOSTNAME}:${PORT}/api/keys`);
    if (keys.status !== 200 || !Array.isArray(keys.body?.configuredIds)) {
      throw new Error(`/api/keys inesperado: ${JSON.stringify(keys)}`);
    }

    console.log(
      `[smoke] ok: health=${health.status} (mode=${health.body.mode}), keys=${keys.status} (configuredIds=${keys.body.configuredIds.length})`
    );
    shutdown();
    process.exit(0);
  } catch (err) {
    if (stderr) console.error(stderr);
    throw err;
  } finally {
    shutdown();
  }
}

main().catch((err) => {
  console.error(`[smoke] FALLO: ${err.message}`);
  process.exit(1);
});
