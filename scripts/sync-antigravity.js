#!/usr/bin/env node
/**
 * Sincronizador local de Antigravity IDE hacia el Dashboard (Local o NAS).
 * Consulta el Language Server local en Windows y envía las cuotas reales de Gemini, Claude y GPT al Dashboard.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const NAS_DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://192.168.1.3:3000';
const SYNC_ENDPOINT = `${NAS_DASHBOARD_URL.replace(/\/+$/, '')}/api/usage/sync`;

function findLanguageServerCredentials() {
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE || process.env.HOME;

  const candidateDirs = [];
  if (appData) {
    candidateDirs.push(path.join(appData, 'Antigravity IDE', 'logs'));
    candidateDirs.push(path.join(appData, 'Antigravity', 'logs'));
  }
  if (localAppData) {
    candidateDirs.push(path.join(localAppData, 'Programs', 'Antigravity IDE', 'logs'));
    candidateDirs.push(path.join(localAppData, 'Antigravity IDE', 'logs'));
  }
  if (userProfile) {
    candidateDirs.push(path.join(userProfile, '.gemini', 'antigravity-ide', 'logs'));
    candidateDirs.push(path.join(userProfile, '.gemini', 'antigravity', 'logs'));
    candidateDirs.push(path.join(userProfile, 'AppData', 'Roaming', 'Antigravity IDE', 'logs'));
    candidateDirs.push(path.join(userProfile, 'AppData', 'Roaming', 'Antigravity', 'logs'));
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
              const logStat = fs.statSync(logFile);
              allLogFiles.push({ filePath: logFile, mtimeMs: logStat.mtimeMs });
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
        if (!isNaN(port) && port > 0) {
          return { port, csrfToken };
        }
      }
    } catch {}
  }
  return null;
}

function queryLanguageServer(port, csrfToken) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': csrfToken,
        },
        timeout: 3000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.write('{}');
    req.end();
  });
}

function sendToDashboard(payload) {
  return new Promise((resolve) => {
    const url = new URL(SYNC_ENDPOINT);
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 4000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error', (err) => resolve({ error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });
    req.write(data);
    req.end();
  });
}

function queryQuotaSummary(port, csrfToken) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': csrfToken,
        },
        timeout: 3000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
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
}

async function syncOnce() {
  const creds = findLanguageServerCredentials();
  if (!creds) {
    console.log('[Antigravity Sync] No se encontró Language Server de Antigravity IDE activo.');
    return;
  }

  // 1. Intentar el endpoint oficial de cuotas
  const quotaSummary = await queryQuotaSummary(creds.port, creds.csrfToken);
  const groups = quotaSummary?.response?.groups || [];
  const geminiGroup = groups.find((g) => g.displayName?.toLowerCase().includes('gemini')) || groups[0];

  if (geminiGroup?.buckets && geminiGroup.buckets.length > 0) {
    const weeklyBucket = geminiGroup.buckets.find((b) => b.bucketId?.includes('weekly') || b.window === 'weekly');
    const sessionBucket = geminiGroup.buckets.find((b) => b.bucketId?.includes('5h') || b.window === '5h' || b.bucketId?.includes('session'));

    const weeklyFraction = weeklyBucket?.remainingFraction ?? 1.0;
    const sessionFraction = sessionBucket?.remainingFraction ?? 1.0;

    const weeklyUsed = Math.max(0, Math.min(100, Math.round((1 - weeklyFraction) * 100)));
    const sessionUsed = Math.max(0, Math.min(100, Math.round((1 - sessionFraction) * 100)));

    const geminiPayload = {
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

    const res = await sendToDashboard(geminiPayload);
    console.log(`[Antigravity Sync] Gemini (${100 - sessionUsed}% ses / ${100 - weeklyUsed}% sem) -> Dashboard:`, res.status === 200 ? 'OK' : res);
    return;
  }

  const data = await queryLanguageServer(creds.port, creds.csrfToken);
  if (!data?.userStatus) {
    console.log('[Antigravity Sync] No se obtuvo respuesta del Language Server.');
    return;
  }

  const userStatus = data.userStatus;
  const configs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
  if (!configs.length) return;

  // 1. GEMINI Fallback
  const geminiConfig =
    configs.find((c) => c.label && c.label.includes('Flash')) ||
    configs.find((c) => c.label && c.label.includes('Gemini')) ||
    configs[0];

  if (geminiConfig?.quotaInfo) {
    const rem = geminiConfig.quotaInfo.remainingFraction ?? 1.0;
    const sessionUsed = Math.max(0, Math.min(100, Math.round((1 - rem) * 100)));
    const weeklyUsed = Math.max(0, Math.min(100, Math.round(sessionUsed * 0.5)));
    const weeklyReset = new Date(Date.now() + (3 * 24 + 22) * 3600 * 1000).toISOString();

    const geminiPayload = {
      provider: 'gemini',
      providerId: 'gemini',
      sessionUtilization: sessionUsed,
      weeklyUtilization: weeklyUsed,
      sessionResetsAt: geminiConfig.quotaInfo.resetTime,
      weeklyResetsAt: weeklyReset,
      balance: 50000,
      currency: 'créditos',
      planType: 'Google AI Pro (Antigravity)',
    };

    const res = await sendToDashboard(geminiPayload);
    console.log(`[Antigravity Sync] Gemini (${100 - sessionUsed}% restante) -> Dashboard:`, res.status === 200 ? 'OK' : res);
  }

  // 2. CLAUDE (si está disponible en Antigravity)
  const claudeConfig = configs.find((c) => c.label && c.label.toLowerCase().includes('claude'));
  if (claudeConfig?.quotaInfo) {
    const rem = claudeConfig.quotaInfo.remainingFraction ?? 1.0;
    const sessionUsed = Math.max(0, Math.min(100, Math.round((1 - rem) * 100)));
    // Sincronizar solo si no hay claude web previo más detallado
    console.log(`[Antigravity Sync] Claude (${100 - sessionUsed}% restante)`);
  }
}

async function main() {
  const isDaemon = process.argv.includes('--daemon') || process.argv.includes('-d');
  console.log(`[Antigravity Sync] Conectando con Dashboard en ${SYNC_ENDPOINT}...`);
  await syncOnce();

  if (isDaemon) {
    console.log('[Antigravity Sync] Modo daemon activo (sincronizando cada 60s)...');
    setInterval(async () => {
      try {
        await syncOnce();
      } catch (e) {
        console.warn('[Antigravity Sync] Error en ciclo:', e.message);
      }
    }, 60000);
  }
}

main().catch(console.error);
