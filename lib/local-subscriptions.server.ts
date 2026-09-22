import fs from 'fs';
import path from 'path';
import os from 'os';

export interface LocalClaudeCredentials {
  token: string;
  refreshToken?: string;
  subscriptionType?: string;
  rateLimitTier?: string;
  expiresAt?: string;
}

export interface LocalCodexCredentials {
  accessToken: string;
  accountId?: string;
  refreshToken?: string;
  authMode?: string;
}

export interface LocalAntigravityCredentials {
  port: number;
  csrfToken: string;
}

export interface LocalSubscriptionsStatus {
  claude: { available: boolean; source?: string; details?: string };
  openai: { available: boolean; source?: string; details?: string };
  gemini: { available: boolean; source?: string; details?: string };
}

/**
 * Obtiene credenciales de Claude Code (~/.claude/.credentials.json)
 */
export function getLocalClaudeCredentials(): LocalClaudeCredentials | null {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) return null;

    const raw = fs.readFileSync(credPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: {
        accessToken?: string;
        refreshToken?: string;
        subscriptionType?: string;
        rateLimitTier?: string;
        expiresAt?: number | string;
      };
    };

    const oauth = parsed?.claudeAiOauth;
    if (oauth?.accessToken) {
      return {
        token: oauth.accessToken,
        refreshToken: oauth.refreshToken,
        subscriptionType: oauth.subscriptionType,
        rateLimitTier: oauth.rateLimitTier,
        expiresAt: oauth.expiresAt ? new Date(oauth.expiresAt).toISOString() : undefined,
      };
    }
  } catch (err) {
    console.warn('[local-subscriptions] Error leyendo ~/.claude/.credentials.json:', err);
  }
  return null;
}

/**
 * Obtiene credenciales de Codex / ChatGPT Plus (~/.codex/auth.json)
 */
export function getLocalCodexCredentials(): LocalCodexCredentials | null {
  try {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    if (!fs.existsSync(authPath)) return null;

    const raw = fs.readFileSync(authPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      auth_mode?: string;
      tokens?: {
        access_token?: string;
        account_id?: string;
        refresh_token?: string;
      };
    };

    if (parsed?.tokens?.access_token) {
      return {
        accessToken: parsed.tokens.access_token,
        accountId: parsed.tokens.account_id,
        refreshToken: parsed.tokens.refresh_token,
        authMode: parsed.auth_mode,
      };
    }
  } catch (err) {
    console.warn('[local-subscriptions] Error leyendo ~/.codex/auth.json:', err);
  }
  return null;
}

/**
 * Encuentra dinámicamente el puerto y CSRF token del Language Server de Antigravity IDE
 */
export function getAntigravityLanguageServerCredentials(): LocalAntigravityCredentials | null {
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE || process.env.HOME || os.homedir();

  const candidateDirs: string[] = [];
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

  const allLogFiles: { filePath: string; mtimeMs: number }[] = [];

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
        } catch {
          // continuar
        }
      }
    } catch {
      // ignorar
    }
  }

  // Ordenar de más reciente a más antiguo
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
    } catch {
      // continuar
    }
  }

  return null;
}

/**
 * Escaneo global de qué suscripciones locales existen en la máquina
 */
export async function detectAvailableLocalSubscriptions(): Promise<LocalSubscriptionsStatus> {
  const claudeCreds = getLocalClaudeCredentials();
  const codexCreds = getLocalCodexCredentials();
  const agCreds = getAntigravityLanguageServerCredentials();

  return {
    claude: {
      available: Boolean(claudeCreds?.token),
      source: claudeCreds ? '~/.claude/.credentials.json' : undefined,
      details: claudeCreds ? (claudeCreds.subscriptionType || 'Claude Pro / OAuth') : 'No detectado',
    },
    openai: {
      available: Boolean(codexCreds?.accessToken),
      source: codexCreds ? '~/.codex/auth.json' : undefined,
      details: codexCreds ? 'ChatGPT Plus / Codex' : 'No detectado',
    },
    gemini: {
      available: Boolean(agCreds?.port),
      source: agCreds ? `Antigravity LS (puerto ${agCreds.port})` : undefined,
      details: agCreds ? 'Google AI Pro (Antigravity)' : 'No detectado',
    },
  };
}
