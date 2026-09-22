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

interface QuotaSummaryBucket {
  bucketId?: string;
  displayName?: string;
  description?: string;
  window?: string;
  remainingFraction?: number;
  resetTime?: string;
}

interface QuotaSummaryGroup {
  displayName?: string;
  description?: string;
  buckets?: QuotaSummaryBucket[];
}

interface QuotaSummaryResponse {
  response?: {
    groups?: QuotaSummaryGroup[];
    description?: string;
  };
}

function queryUserQuotaSummary(port: number, csrfToken: string): Promise<QuotaSummaryResponse | null> {
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
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as QuotaSummaryResponse);
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
  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE || process.env.HOME;

  // Busca en todos los posibles directorios de logs de Antigravity IDE y Antigravity
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
      // Ignorar errores de lectura de directorios protegidos
    }
  }

  // Ordenar de más reciente a más antiguo según fecha de modificación
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
      // continuar con el siguiente
    }
  }

  return null;
}

/**
 * Consulta la cuota en tiempo real del Language Server local de Antigravity.
 * Extrae límites y cuotas reales de Gemini, Claude o GPT según el proveedor solicitado.
 */
export async function fetchAntigravityUsage(providerTarget: string = 'gemini'): Promise<ApiUsageSnapshot | null> {
  try {
    const creds = findLanguageServerCredentials();
    if (!creds) {
      return null;
    }

    // 1. Intentar obtener el resumen oficial de cuotas (RetrieveUserQuotaSummary)
    const quotaSummary = await queryUserQuotaSummary(creds.port, creds.csrfToken);
    const groups = quotaSummary?.response?.groups || [];

    if (groups.length > 0) {
      let targetGroup: QuotaSummaryGroup | undefined;
      if (providerTarget === 'claude' || providerTarget === 'claude-pro' || providerTarget === 'anthropic' || providerTarget === 'openai') {
        targetGroup = groups.find((g) => g.displayName?.toLowerCase().includes('claude') || g.displayName?.toLowerCase().includes('gpt'));
      } else {
        // Gemini por defecto
        targetGroup = groups.find((g) => g.displayName?.toLowerCase().includes('gemini')) || groups[0];
      }

      if (targetGroup?.buckets && targetGroup.buckets.length > 0) {
        const weeklyBucket = targetGroup.buckets.find((b) => b.bucketId?.includes('weekly') || b.window === 'weekly');
        const sessionBucket = targetGroup.buckets.find((b) => b.bucketId?.includes('5h') || b.window === '5h' || b.bucketId?.includes('session'));

        const weeklyFraction = weeklyBucket?.remainingFraction ?? 1.0;
        const sessionFraction = sessionBucket?.remainingFraction ?? 1.0;

        const sessionUsed = Math.max(0, Math.min(100, Math.round((1 - sessionFraction) * 100)));
        const weeklyUsed = Math.max(0, Math.min(100, Math.round((1 - weeklyFraction) * 100)));

        return {
          fetchedAt: new Date().toISOString(),
          planType: 'Google AI Pro (Antigravity)',
          sessionUtilization: sessionUsed,
          weeklyUtilization: weeklyUsed,
          sessionResetsAt: sessionBucket?.resetTime,
          weeklyResetsAt: weeklyBucket?.resetTime,
          balance: 50000,
          currency: 'créditos',
          unavailable: ['accumulatedCost', 'tokensUsed', 'requestCount'],
        };
      }
    }

    // 2. Fallback a GetUserStatus si RetrieveUserQuotaSummary no está disponible
    const data = await queryLanguageServer(creds.port, creds.csrfToken);
    if (!data?.userStatus) {
      return null;
    }

    const userStatus = data.userStatus;
    const configs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
    if (!configs.length) {
      return null;
    }

    let selectedConfig: ClientModelConfig | undefined;
    let detectedPlan = 'Google AI Pro';

    if (providerTarget === 'claude' || providerTarget === 'claude-pro' || providerTarget === 'anthropic') {
      const claudeConfigs = configs.filter((c) => c.label && c.label.toLowerCase().includes('claude'));
      selectedConfig =
        claudeConfigs.find((c) => c.label?.includes('Sonnet')) ||
        claudeConfigs.find((c) => c.label?.includes('Opus')) ||
        claudeConfigs[0];
      detectedPlan = selectedConfig?.label || 'Claude (Antigravity)';
    } else if (providerTarget === 'openai' || providerTarget === 'chatgpt') {
      const gptConfigs = configs.filter((c) => c.label && (c.label.toLowerCase().includes('gpt') || c.label.toLowerCase().includes('openai')));
      selectedConfig = gptConfigs[0];
      detectedPlan = selectedConfig?.label || 'GPT (Antigravity)';
    } else {
      // Gemini por defecto
      const geminiConfigs = configs.filter((c) => c.label && c.label.toLowerCase().includes('gemini'));
      selectedConfig =
        geminiConfigs.find((c) => c.label?.includes('3.8 Flash')) ||
        geminiConfigs.find((c) => c.label?.includes('3.7 Flash')) ||
        geminiConfigs.find((c) => c.label?.includes('3.6 Flash')) ||
        geminiConfigs.find((c) => c.label?.includes('3.1 Pro')) ||
        geminiConfigs[0] ||
        configs[0];
      detectedPlan = selectedConfig?.label || 'Google Gemini (Antigravity)';
    }

    if (!selectedConfig) {
      selectedConfig = configs[0];
    }

    const quota = selectedConfig?.quotaInfo;
    const remainingFraction =
      typeof quota?.remainingFraction === 'number'
        ? quota.remainingFraction
        : 1.0;

    // sessionUtilization es el porcentaje USADO (0 a 100)
    const sessionUsed = Math.max(0, Math.min(100, Math.round((1 - remainingFraction) * 100)));

    // Weekly limit aproximado según el ritmo de consumo de la sesión
    const weeklyUsed = Math.max(0, Math.min(100, Math.round(sessionUsed * 0.2)));

    const tierName =
      userStatus.userTier?.name || userStatus.planStatus?.planInfo?.planName || 'Pro';
    const planType = `${tierName} • ${detectedPlan}`;

    const promptCredits = userStatus.planStatus?.planInfo?.monthlyPromptCredits ?? 50000;

    // Fecha de reinicio semanal aproximada (6 días y pico)
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
