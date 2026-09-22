#!/usr/bin/env node
/**
 * Sincronizador Automático de Suscripciones de IA hacia el Dashboard del NAS.
 * 
 * Lee las credenciales locales de este equipo:
 *  1. Claude Code (~/.claude/.credentials.json)
 *  2. ChatGPT Plus / Codex (~/.codex/auth.json)
 *  3. Google Gemini (Antigravity IDE Language Server)
 * 
 * Y las envía a:
 *  - /api/keys: para que el contenedor del NAS pueda consultar directamente a OpenAI y Anthropic de forma autónoma.
 *  - /api/usage/sync: para actualizar los porcentajes en tiempo real con latencia cero.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');

const NAS_HOST = process.env.DASHBOARD_HOST || '192.168.1.3';
const NAS_PORT = parseInt(process.env.DASHBOARD_PORT || '3000', 10);
const USER_PROFILE = process.env.USERPROFILE || process.env.HOME || os.homedir();

if (process.stdout && typeof process.stdout.on === 'function') {
  process.stdout.on('error', () => {});
}
if (process.stderr && typeof process.stderr.on === 'function') {
  process.stderr.on('error', () => {});
}

function postJson(pathEndpoint, data) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: NAS_HOST,
        port: NAS_PORT,
        path: pathEndpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', (err) => resolve({ error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });
    req.write(payload);
    req.end();
  });
}

function putJson(pathEndpoint, data) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: NAS_HOST,
        port: NAS_PORT,
        path: pathEndpoint,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', (err) => resolve({ error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });
    req.write(payload);
    req.end();
  });
}

// 1. CLAUDE
async function syncClaude() {
  const claudePath = path.join(USER_PROFILE, '.claude', '.credentials.json');
  if (!fs.existsSync(claudePath)) return null;

  try {
    const raw = fs.readFileSync(claudePath, 'utf8');
    const creds = JSON.parse(raw);
    const token = creds.claudeAiOauth?.accessToken;
    if (!token) return null;

    // Actualizar credencial en el NAS
    await putJson('/api/keys', { data: { 'claude-pro': token, 'anthropic': token } });

    // Consultar uso OAuth
    const usage = await new Promise((resolve, reject) => {
      https.get(
        'https://api.anthropic.com/api/oauth/usage',
        {
          headers: {
            Authorization: 'Bearer ' + token,
            'anthropic-beta': 'oauth-2025-04-20',
            'User-Agent': 'claude-code/0.2.29',
          },
          timeout: 6000,
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(b));
            } catch (e) {
              reject(e);
            }
          });
        }
      ).on('error', reject);
    });

    const sessionUsed = Math.round(usage.five_hour?.utilization ?? 0);
    const weeklyUsed = Math.round(usage.seven_day?.utilization ?? 0);
    const cost = usage.extra_usage?.used_credits ? usage.extra_usage.used_credits / 100 : undefined;

    const breakdown = usage.seven_day_breakdown?.rows
      ?.map((r) => `${r.display_name}: ${r.percent}%`)
      ?.join(' • ');

    const payload = {
      provider: 'claude-pro',
      providerId: 'claude-pro',
      sessionUtilization: sessionUsed,
      weeklyUtilization: weeklyUsed,
      sessionResetsAt: usage.five_hour?.resets_at,
      weeklyResetsAt: usage.seven_day?.resets_at,
      accumulatedCost: cost,
      currency: usage.extra_usage?.currency || 'EUR',
      planType: breakdown ? `Claude Pro (${breakdown})` : 'Claude Pro',
    };

    await postJson('/api/usage/sync', payload);
    return { name: 'Claude Pro', sessionRem: 100 - sessionUsed, weeklyRem: 100 - weeklyUsed };
  } catch (err) {
    console.warn('[Sync Claude] Error:', err.message);
    return null;
  }
}

// 2. OPENAI / CODEX
async function syncOpenAI() {
  const codexPath = path.join(USER_PROFILE, '.codex', 'auth.json');
  if (!fs.existsSync(codexPath)) return null;

  try {
    const raw = fs.readFileSync(codexPath, 'utf8');
    const creds = JSON.parse(raw);
    const token = creds.tokens?.access_token;
    const accountId = creds.tokens?.account_id;
    if (!token) return null;

    // Actualizar credencial en el NAS
    await putJson('/api/keys', {
      data: {
        openai: JSON.stringify({ accessToken: token, organizationId: accountId }),
      },
    });

    // Consultar uso backend-api
    const usage = await new Promise((resolve, reject) => {
      https.get(
        'https://chatgpt.com/backend-api/wham/usage',
        {
          headers: {
            Authorization: 'Bearer ' + token,
            'ChatGPT-Account-Id': accountId,
            'User-Agent': 'codex-cli/0.1.0',
            originator: 'Codex Desktop',
          },
          timeout: 6000,
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(b));
            } catch (e) {
              reject(e);
            }
          });
        }
      ).on('error', reject);
    });

    const pw = usage.rate_limit?.primary_window;
    const sw = usage.rate_limit?.secondary_window;
    const sessionUsed = pw?.used_percent ?? 0;
    const weeklyUsed = sw?.used_percent ?? 0;
    const resetCredits = usage.rate_limit_reset_credits?.available_count;

    const payload = {
      provider: 'openai',
      providerId: 'openai',
      sessionUtilization: sessionUsed,
      weeklyUtilization: weeklyUsed,
      sessionResetsAt: pw?.reset_after_seconds ? new Date(Date.now() + pw.reset_after_seconds * 1000).toISOString() : undefined,
      weeklyResetsAt: sw?.reset_after_seconds ? new Date(Date.now() + sw.reset_after_seconds * 1000).toISOString() : undefined,
      balance: usage.credits?.balance ? parseFloat(usage.credits.balance) : 0,
      currency: 'USD',
      planType: resetCredits ? `ChatGPT Plus (${resetCredits} créditos de reseteo)` : 'ChatGPT Plus',
    };

    await postJson('/api/usage/sync', payload);
    return { name: 'ChatGPT Plus', sessionRem: 100 - sessionUsed, weeklyRem: 100 - weeklyUsed };
  } catch (err) {
    console.warn('[Sync OpenAI] Error:', err.message);
    return null;
  }
}

// 3. GEMINI / ANTIGRAVITY
function findAntigravityLogs() {
  const candidateDirs = [];
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;

  if (appData) {
    candidateDirs.push(path.join(appData, 'Antigravity IDE', 'logs'));
    candidateDirs.push(path.join(appData, 'Antigravity', 'logs'));
  }
  if (localAppData) {
    candidateDirs.push(path.join(localAppData, 'Programs', 'Antigravity IDE', 'logs'));
    candidateDirs.push(path.join(localAppData, 'Antigravity IDE', 'logs'));
  }
  if (USER_PROFILE) {
    candidateDirs.push(path.join(USER_PROFILE, '.gemini', 'antigravity-ide', 'logs'));
    candidateDirs.push(path.join(USER_PROFILE, '.gemini', 'antigravity', 'logs'));
    candidateDirs.push(path.join(USER_PROFILE, 'AppData', 'Roaming', 'Antigravity IDE', 'logs'));
  }

  const allLogFiles = [];
  for (const baseDir of candidateDirs) {
    if (!fs.existsSync(baseDir)) continue;
    try {
      const entries = fs.readdirSync(baseDir);
      for (const entry of entries) {
        const subDir = path.join(baseDir, entry);
        try {
          const stat = fs.statSync(subDir);
          if (stat.isDirectory()) {
            const logFile = path.join(subDir, 'ls-main.log');
            if (fs.existsSync(logFile)) {
              allLogFiles.push({ filePath: logFile, mtimeMs: fs.statSync(logFile).mtimeMs });
            }
          }
        } catch {}
      }
    } catch {}
  }

  allLogFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const { filePath } of allLogFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const csrfMatch = content.match(/--csrf_token\s+([a-f0-9-]+)/i);
      const portMatch = content.match(/listening on random port at (\d+) for HTTP\b/i);
      if (csrfMatch && portMatch) {
        const port = parseInt(portMatch[1], 10);
        const csrfToken = csrfMatch[1];
        if (!isNaN(port) && port > 0) return { port, csrfToken };
      }
    } catch {}
  }
  return null;
}

async function syncGemini() {
  const creds = findAntigravityLogs();
  if (!creds) return null;

  try {
    // 1. Intentar RetrieveUserQuotaSummary (mismo endpoint que usa la pantalla Settings - Models)
    const quotaData = await new Promise((resolve) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: creds.port,
          path: '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-codeium-csrf-token': creds.csrfToken,
          },
          timeout: 3000,
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(b));
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.write('{}');
      req.end();
    });

    const groups = quotaData?.response?.groups || [];
    const geminiGroup = groups.find((g) => g.displayName?.toLowerCase().includes('gemini')) || groups[0];

    if (geminiGroup?.buckets && geminiGroup.buckets.length > 0) {
      const weeklyBucket = geminiGroup.buckets.find((b) => b.bucketId?.includes('weekly') || b.window === 'weekly');
      const sessionBucket = geminiGroup.buckets.find((b) => b.bucketId?.includes('5h') || b.window === '5h' || b.bucketId?.includes('session'));

      const weeklyFraction = weeklyBucket?.remainingFraction ?? 1.0;
      const sessionFraction = sessionBucket?.remainingFraction ?? 1.0;

      const weeklyUsed = Math.max(0, Math.min(100, Math.round((1 - weeklyFraction) * 100)));
      const sessionUsed = Math.max(0, Math.min(100, Math.round((1 - sessionFraction) * 100)));

      const payload = {
        provider: 'gemini',
        providerId: 'gemini',
        sessionUtilization: sessionUsed,
        weeklyUtilization: weeklyUsed,
        sessionResetsAt: sessionBucket?.resetTime,
        weeklyResetsAt: weeklyBucket?.resetTime,
        balance: 50000,
        currency: 'créditos',
        planType: 'Google AI Pro (Antigravity)',
      };

      await postJson('/api/usage/sync', payload);
      return {
        name: 'Google Gemini',
        sessionRem: 100 - sessionUsed,
        weeklyRem: 100 - weeklyUsed,
      };
    }

    // 2. Fallback a GetUserStatus
    const data = await new Promise((resolve) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: creds.port,
          path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-codeium-csrf-token': creds.csrfToken,
          },
          timeout: 3000,
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(b));
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.write('{}');
      req.end();
    });

    const configs = data?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
    const geminiConfig =
      configs.find((c) => c.label && (c.label.includes('Flash') || c.label.includes('Gemini'))) || configs[0];

    if (geminiConfig?.quotaInfo) {
      const rem = geminiConfig.quotaInfo.remainingFraction ?? 1.0;
      const sessionUsed = Math.max(0, Math.min(100, Math.round((1 - rem) * 100)));

      const payload = {
        provider: 'gemini',
        providerId: 'gemini',
        sessionUtilization: sessionUsed,
        weeklyUtilization: Math.round(sessionUsed * 0.5),
        sessionResetsAt: geminiConfig.quotaInfo.resetTime,
        balance: 50000,
        currency: 'créditos',
        planType: 'Google AI Pro (Antigravity)',
      };

      await postJson('/api/usage/sync', payload);
      return { name: 'Google Gemini', sessionRem: 100 - sessionUsed, weeklyRem: 50 };
    }
  } catch (err) {
    console.warn('[Sync Gemini] Error:', err.message);
  }
  return null;
}

const LOG_DIR = path.join(process.env.APPDATA || os.tmpdir(), 'Dashboard_Uso_APIs');
const LOG_FILE = path.join(LOG_DIR, 'sync.log');
const LOCK_FILE = path.join(os.tmpdir(), 'dashboard-apis-sync.pid');

function appendLog(msg) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    // Rotar si supera 1MB
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1024 * 1024) {
      const backup = path.join(LOG_DIR, 'sync.old.log');
      try { fs.renameSync(LOG_FILE, backup); } catch { fs.unlinkSync(LOG_FILE); }
    }
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch {
    // Silencioso ante errores de logging
  }
}

const net = require('net');
const SYNC_MUTEX_PORT = 37482;
let mutexServer = null;

function acquireLock() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log('[Daemon] Ya hay una instancia ejecutándose en segundo plano (puerto activo).');
        process.exit(0);
      }
      resolve(false);
    });
    server.once('listening', () => {
      mutexServer = server;
      try {
        fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
      } catch (e) {
        console.warn('[Daemon] No se pudo escribir PID lock:', e.message);
      }
      resolve(true);
    });
    server.listen(SYNC_MUTEX_PORT, '127.0.0.1');
  });
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch {
    // Ignorar
  }
  if (mutexServer) {
    try { mutexServer.close(); } catch {}
  }
}

process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

async function runSyncCycle() {
  const timestamp = new Date().toLocaleTimeString();
  const [cRes, oRes, gRes] = await Promise.all([syncClaude(), syncOpenAI(), syncGemini()]);
  const parts = [];
  if (cRes) parts.push(`Claude: ${cRes.sessionRem}% ses / ${cRes.weeklyRem}% sem`);
  if (oRes) parts.push(`ChatGPT: ${oRes.sessionRem}% ses / ${oRes.weeklyRem}% sem`);
  if (gRes) {
    const sem = gRes.weeklyRem !== undefined ? ` / ${gRes.weeklyRem}% sem` : '';
    parts.push(`Gemini: ${gRes.sessionRem}% ses${sem}`);
  }
  const summary = parts.length ? parts.join(' | ') : 'Sin datos disponibles.';
  console.log(`[${timestamp}] Sincronizando con NAS (${NAS_HOST}:${NAS_PORT})... ${summary}`);
  appendLog(summary);
}

async function main() {
  const isDaemon = process.argv.includes('--daemon') || process.argv.includes('-d');
  
  if (isDaemon) {
    await acquireLock();
  }

  console.log(`=== Sincronizador de Suscripciones IA -> NAS ===`);
  console.log(`Destino: http://${NAS_HOST}:${NAS_PORT}`);
  console.log(`Modo: ${isDaemon ? 'Demonio continuo (cada 60s)' : 'Ejecución única'}\n`);
  appendLog(`Iniciando sincronizador en modo ${isDaemon ? 'demonio continuo' : 'ejecución única'}`);

  await runSyncCycle();

  if (isDaemon) {
    setInterval(async () => {
      try {
        await runSyncCycle();
      } catch (e) {
        console.error('Error en ciclo:', e.message);
        appendLog(`Error en ciclo: ${e.message}`);
      }
    }, 60000);
  }
}

main().catch((err) => {
  console.error(err);
  appendLog(`Error fatal: ${err.message}`);
});

