import http from 'http';
import { execSync } from 'child_process';
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
      };
    };
    cascadeModelConfigData?: {
      clientModelConfigs?: ClientModelConfig[];
    };
  };
}

function queryLanguageServer(port: number, csrfToken: string, path: string): Promise<UserStatusResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
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
              resolve(JSON.parse(body) as UserStatusResponse);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.write('{}');
    req.end();
  });
}

export async function fetchAntigravityUsage(): Promise<ApiUsageSnapshot | null> {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const psScript = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*language_server*' } | Select-Object ProcessId, CommandLine | Format-List`;
    const output = execSync(`powershell -NoProfile -Command "${psScript}"`, {
      encoding: 'utf-8',
      timeout: 6000,
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    const blocks = output.split(/\r?\n\s*\r?\n/);
    for (const block of blocks) {
      const pidMatch = block.match(/ProcessId\s*:\s*(\d+)/i);
      const csrfMatch = block.match(/--csrf_token\s+([a-f0-9-]+)/i);

      if (pidMatch && csrfMatch) {
        const pid = pidMatch[1];
        const csrfToken = csrfMatch[1];

        const netCmd = `Get-NetTCPConnection -OwningProcess ${pid} -State Listen | Select-Object -ExpandProperty LocalPort`;
        const netOut = execSync(`powershell -NoProfile -Command "${netCmd}"`, {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'ignore'],
        });

        const ports = netOut
          .split(/\s+/)
          .map((p) => parseInt(p, 10))
          .filter((p) => !isNaN(p));

        for (const port of ports) {
          try {
            const data = await queryLanguageServer(port, csrfToken, '/exa.language_server_pb.LanguageServerService/GetUserStatus');
            if (data?.userStatus) {
              const userStatus = data.userStatus;
              const configs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];

              // Encuentra la cuota para Gemini
              const geminiConfigs = configs.filter((c) => c.label && c.label.toLowerCase().includes('gemini'));
              const preferredConfig =
                geminiConfigs.find((c) => c.label?.includes('3.7 Flash') || c.label?.includes('High')) ||
                geminiConfigs[0] ||
                configs[0];

              const quota = preferredConfig?.quotaInfo;
              const remainingFraction = typeof quota?.remainingFraction === 'number' ? quota.remainingFraction : 1;
              const utilization = Math.max(0, Math.min(100, Math.round((1 - remainingFraction) * 100)));

              const tierName = userStatus.userTier?.name || userStatus.planStatus?.planInfo?.planName || 'Google AI Pro';
              const planType = `${tierName} (Antigravity)`;

              return {
                fetchedAt: new Date().toISOString(),
                planType,
                sessionUtilization: utilization,
                weeklyUtilization: utilization,
                sessionResetsAt: quota?.resetTime,
                weeklyResetsAt: quota?.resetTime,
                unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'],
              };
            }
          } catch {
            // Siguiente puerto si este no es el servidor HTTP de GetUserStatus
          }
        }
      }
    }
  } catch (err) {
    console.warn('[antigravity] Failed to query language server:', err);
  }

  return null;
}
