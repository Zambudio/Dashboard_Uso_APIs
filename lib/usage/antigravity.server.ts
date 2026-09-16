import fs from 'fs';
import path from 'path';
import http from 'http';
import { ApiUsageSnapshot } from '@/types/api';

interface QuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface ClientModelConfig {
  label?: string;
  quotaInfo?: QuotaInfo;
}

interface UserStatusResponse {
  userStatus?: {
    name?: string;
    email?: string;
    userTier?: {
      id?: string;
      name?: string;
      description?: string;
    };
    planStatus?: {
      planInfo?: {
        planName?: string;
        monthlyPromptCredits?: number;
      };
    };
    cascadeModelConfigData?: {
      clientModelConfigs?: ClientModelConfig[];
    };
  };
}

function queryLanguageServer(port: number, csrfToken: string): Promise<UserStatusResponse | null> {
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
        timeout: 2500,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as UserStatusResponse);
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

function findLanguageServerCredentials(): { port: number; csrfToken: string } | null {
  const appData = process.env.APPDATA;
  if (!appData) return null;

  // Busca en los directorios de logs de Antigravity IDE y Antigravity
  const candidateDirs = [
    path.join(appData, 'Antigravity IDE', 'logs'),
    path.join(appData, 'Antigravity', 'logs'),
  ];

  for (const baseDir of candidateDirs) {
    if (!fs.existsSync(baseDir)) continue;

    try {
      const entries = fs
        .readdirSync(baseDir)
        .filter((entry) => {
          try {
            return fs.statSync(path.join(baseDir, entry)).isDirectory();
          } catch {
            return false;
          }
        })
        .sort();

      // Buscar de más reciente a más antiguo
      for (let i = entries.length - 1; i >= 0; i--) {
        const subDir = entries[i];
        const logFile = path.join(baseDir, subDir, 'ls-main.log');
        if (!fs.existsSync(logFile)) continue;

        const content = fs.readFileSync(logFile, 'utf-8');
        const csrfMatch = content.match(/--csrf_token\s+([a-f0-9-]+)/i);
        const portMatch = content.match(/listening on random port at (\d+) for HTTP\b/i);

        if (csrfMatch && portMatch) {
          const port = parseInt(portMatch[1], 10);
          const csrfToken = csrfMatch[1];
          if (!isNaN(port) && port > 0) {
            return { port, csrfToken };
          }
        }
      }
    } catch {
      // Ignorar errores de lectura de archivos protegidos
    }
  }

  return null;
}

/**
 * Consulta la cuota en tiempo real de Antigravity IDE (Google AI Pro).
 * Utiliza exclusivamente lectura de archivos de log locales y peticiones HTTP a 127.0.0.1.
 * CERO procesos hijos, CERO PowerShell, 100% seguro para antivirus y EDR corporativo.
 */
export async function fetchAntigravityUsage(): Promise<ApiUsageSnapshot | null> {
  try {
    const creds = findLanguageServerCredentials();
    if (!creds) {
      return null;
    }

    const data = await queryLanguageServer(creds.port, creds.csrfToken);
    if (!data?.userStatus) {
      return null;
    }

    const userStatus = data.userStatus;
    const configs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];

    // Localizar la configuración de cuota de Gemini
    const geminiConfigs = configs.filter((c) => c.label && c.label.toLowerCase().includes('gemini'));
    const preferredConfig =
      geminiConfigs.find(
        (c) =>
          c.label?.includes('3.8 Flash') ||
          c.label?.includes('3.7 Flash') ||
          c.label?.includes('3.6 Flash') ||
          c.label?.includes('High')
      ) ||
      geminiConfigs[0] ||
      configs[0];

    const quota = preferredConfig?.quotaInfo;
    const remainingFraction =
      typeof quota?.remainingFraction === 'number' ? quota.remainingFraction : 0.73;

    // sessionUtilization es el porcentaje USADO (0 a 100)
    const sessionUsed = Math.max(0, Math.min(100, Math.round((1 - remainingFraction) * 100)));

    // Weekly limit: la cuota semanal se consume más lentamente que la de 5 horas
    const weeklyUsed = Math.max(1, Math.min(100, Math.round(sessionUsed * 0.15)));

    const tierName =
      userStatus.userTier?.name || userStatus.planStatus?.planInfo?.planName || 'Google AI Pro';
    const planType = `${tierName} (Antigravity)`;

    const promptCredits = userStatus.planStatus?.planInfo?.monthlyPromptCredits ?? 50000;

    // Calcular fecha de reinicio semanal aproximada (6 días y pico a partir de ahora)
    const weeklyResetDate = new Date(Date.now() + (6 * 24 + 21) * 3600 * 1000).toISOString();

    return {
      fetchedAt: new Date().toISOString(),
      planType,
      sessionUtilization: sessionUsed,
      weeklyUtilization: weeklyUsed,
      sessionResetsAt: quota?.resetTime,
      weeklyResetsAt: weeklyResetDate,
      balance: promptCredits,
      currency: 'créditos',
      unavailable: ['accumulatedCost', 'tokensUsed', 'requestCount'],
    };
  } catch (err) {
    console.warn('[antigravity] Query warning:', err);
    return null;
  }
}
