import { Browser, BrowserContext, Page } from 'playwright';
import { ApiUsageSnapshot, ProviderKey } from '@/types/api';
import { readEnvKeys, writeEnvKeys } from '@/lib/env-keys.server';
import { launchAvailableChromium } from '@/lib/playwright-browser.server';
import { fetchClaudeProUsage } from '@/lib/usage/claude-pro.server';
import { fetchOpenAIUsage } from '@/lib/usage/openai.server';
import { parseDeepSeekUsageText } from '@/lib/usage/deepseek-scrape.server';
import { fetchAntigravityUsage } from '@/lib/usage/antigravity.server';

export type BrowserLoginState = 'starting' | 'waiting_user_login' | 'extracting' | 'completed' | 'cancelled' | 'error';

export interface BrowserLoginSession {
  id: string;
  providerId: string;
  provider: ProviderKey;
  status: BrowserLoginState;
  statusMessage: string;
  createdAt: number;
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  usageSnapshot?: ApiUsageSnapshot;
  error?: string;
  checkInterval?: NodeJS.Timeout;
  timeoutTimer?: NodeJS.Timeout;
  capturedBearer?: string;
  isProcessing?: boolean;
}
declare global {
  var __browserLoginSessions: Map<string, BrowserLoginSession> | undefined;
}

const activeSessions: Map<string, BrowserLoginSession> =
  globalThis.__browserLoginSessions ?? (globalThis.__browserLoginSessions = new Map<string, BrowserLoginSession>());

async function launchInteractiveChromium() {
  const launchOptions = {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--disable-infobars',
    ],
  };

  return launchAvailableChromium(launchOptions);
}

async function saveSecretForProvider(providerId: string, secret: string) {
  const currentKeys = await readEnvKeys();
  currentKeys[providerId] = secret;
  await writeEnvKeys(currentKeys);
}

export async function startBrowserLogin(providerId: string, provider: ProviderKey): Promise<{ sessionId: string }> {
  // Cancel and close any active session for this provider first
  activeSessions.forEach((existingSession, existingId) => {
    if (existingSession.providerId === providerId) {
      cleanupSession(existingId, true);
    }
  });

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const session: BrowserLoginSession = {
    id: sessionId,
    providerId,
    provider,
    status: 'starting',
    statusMessage: 'Iniciando ventana de navegador...',
    createdAt: Date.now(),
  };

  activeSessions.set(sessionId, session);

  // Background execution
  void (async () => {
    try {
      const browser = await launchInteractiveChromium();
      session.browser = browser;
      const context: BrowserContext = await browser.newContext({
        viewport: null, // native size
      });
      session.context = context;

      // Anti-bot stealth init script for Google / OAuth popups
      await context.addInitScript(() => {
        try {
          const navigatorPrototype = Object.getPrototypeOf(navigator) as { webdriver?: unknown };
          delete navigatorPrototype.webdriver;
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          (window as Window & { chrome?: Record<string, unknown> }).chrome = {
            runtime: {},
            loadTimes: () => {},
            csi: () => {},
            app: {},
          };
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
          });
          Object.defineProperty(navigator, 'languages', {
            get: () => ['es-ES', 'es', 'en-US', 'en'],
          });
        } catch {
          // ignore
        }
      });

      // Handle popup windows (like Google login popup in DeepSeek)
      context.on('page', (popup) => {
        popup.on('close', async () => {
          try {
            if (session.page && !session.page.isClosed()) {
              await session.page.bringToFront();
            }
          } catch {
            // ignore
          }
        });
      });

      // Un contexto persistente ya abre con una pestaña; reutilizarla evita
      // una ventana extra en blanco junto a la que sí navegamos.
      const page = context.pages()[0] ?? (await context.newPage());
      session.page = page;

      // Handle user manually closing the browser window
      page.on('close', () => {
        if (session.status !== 'completed' && session.status !== 'error') {
          session.status = 'cancelled';
          session.statusMessage = 'Ventana de navegador cerrada por el usuario.';
          cleanupSession(sessionId, false);
        }
      });

      // 5-minute timeout guard
      session.timeoutTimer = setTimeout(() => {
        if (session.status !== 'completed') {
          session.status = 'error';
          session.statusMessage = 'Tiempo de espera agotado (5 minutos).';
          cleanupSession(sessionId, true);
        }
      }, 5 * 60 * 1000);

      if (provider === 'claude-pro' || provider === 'anthropic') {
        await setupClaudeLogin(session);
      } else if (provider === 'openai') {
        await setupOpenAILogin(session);
      } else if (provider === 'gemini') {
        await setupGeminiLogin(session);
      } else if (provider === 'deepseek') {
        await setupDeepSeekLogin(session);
      } else {
        throw new Error(`Inicio de sesión en navegador no soportado para ${provider}`);
      }
    } catch (err) {
      session.status = 'error';
      session.statusMessage = err instanceof Error ? err.message : 'Error desconocido al iniciar el navegador.';
      session.error = session.statusMessage;
      cleanupSession(sessionId, true);
    }
  })();

  return { sessionId };
}

// -------------------------------------------------------------
// CLAUDE LOGIN FLOW
// -------------------------------------------------------------
async function setupClaudeLogin(session: BrowserLoginSession) {
  const page = session.page!;
  const context = session.context!;

  session.status = 'waiting_user_login';
  session.statusMessage = 'Por favor, inicia sesión con tu cuenta en la ventana de Claude...';

  await page.goto('https://claude.ai/login', { waitUntil: 'domcontentloaded' });

  const check = async () => {
    if (session.isProcessing || session.status === 'completed' || session.status === 'error') return;

    try {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'sessionKey' && c.value && c.value.length > 10);

      const url = page.url();
      const isInsideClaude = url.includes('claude.ai') && !url.includes('/login') && !url.includes('/auth');

      if (sessionCookie || isInsideClaude) {
        session.isProcessing = true;
        session.status = 'extracting';
        session.statusMessage = 'Sesión de Claude detectada. Obteniendo datos de consumo...';

        const secret = sessionCookie ? sessionCookie.value : '';

        let snapshot: ApiUsageSnapshot | null = null;

        // Try direct in-page evaluation (fastest & bypasses any Cloudflare challenges)
        try {
          const orgsData = await page.evaluate(async () => {
            try {
              const r = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
              return await r.json();
            } catch {
              return null;
            }
          });

          const orgId = orgsData?.[0]?.uuid;
          if (orgId) {
            const usageData = await page.evaluate(async (id) => {
              try {
                const r = await fetch(`https://claude.ai/api/organizations/${id}/usage`, { credentials: 'include' });
                return await r.json();
              } catch {
                return null;
              }
            }, orgId);

            if (usageData) {
              snapshot = {
                fetchedAt: new Date().toISOString(),
                sessionUtilization: usageData.five_hour?.utilization,
                weeklyUtilization: usageData.seven_day?.utilization,
                sessionResetsAt: usageData.five_hour?.resets_at,
                weeklyResetsAt: usageData.seven_day?.resets_at,
                planType: 'Claude Pro / Team',
                unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'],
              };
            }
          }
        } catch {
          // ignore evaluation error, fallback below
        }

        // Fallback to server-side usage fetcher if we have sessionKey
        if (!snapshot && secret) {
          try {
            snapshot = await fetchClaudeProUsage(secret);
          } catch (e) {
            console.warn('[claude] fetchClaudeProUsage warning:', e);
          }
        }

        if (!snapshot) {
          snapshot = {
            fetchedAt: new Date().toISOString(),
            planType: 'Claude Pro',
            tier: 'Sesión conectada',
            unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'],
          };
        }

        if (secret) {
          await saveSecretForProvider(session.providerId, secret);
        }

        session.usageSnapshot = snapshot;
        session.status = 'completed';
        session.statusMessage = '¡Sesión de Claude vinculada y datos de gasto obtenidos!';

        if (session.checkInterval) clearInterval(session.checkInterval);

        setTimeout(() => {
          cleanupSession(session.id, true);
        }, 1500);
      }
    } catch (err) {
      session.isProcessing = false;
      console.error('[claude-check-err]', err);
    }
  };

  session.checkInterval = setInterval(() => void check(), 1000);
}

// -------------------------------------------------------------
// OPENAI / CHATGPT LOGIN FLOW
// -------------------------------------------------------------
async function setupOpenAILogin(session: BrowserLoginSession) {
  const page = session.page!;
  const context = session.context!;

  session.status = 'waiting_user_login';
  session.statusMessage = 'Por favor, inicia sesión con tu cuenta en la ventana de OpenAI / ChatGPT...';

  let capturedOrgId = '';
  let capturedOrgTitle = '';
  type UsageBucketResponse = {
    data?: Array<{ results?: Array<{
      amount?: { value?: number; currency?: string };
      input_tokens?: number;
      output_tokens?: number;
      num_model_requests?: number;
    }> }>;
  };
  let capturedCostsData: UsageBucketResponse | null = null;
  let capturedUsageData: UsageBucketResponse | null = null;
  let hasNavigatedToUsage = false;

  let capturedWeeklyUtilization: number | undefined;
  let capturedWeeklyResetsAt: string | undefined;

  // Intercept Authorization header and org ID from any requests made in the browser
  page.on('request', (req) => {
    const authHeader = req.headers()['authorization'];
    if (authHeader) {
      if (authHeader.startsWith('Bearer sess-') || authHeader.startsWith('Bearer eyJ')) {
        session.capturedBearer = authHeader.replace('Bearer ', '').trim();
      }
    }
    const orgHeader = req.headers()['openai-organization'];
    if (orgHeader && orgHeader.startsWith('org-')) {
      capturedOrgId = orgHeader.trim();
    }
  });

  // Intercept API responses directly from the browser session
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (res.ok()) {
        if (url.includes('/organization/costs')) {
          capturedCostsData = await res.json().catch(() => null);
        } else if (url.includes('/organization/usage') || url.includes('/usage/completions')) {
          capturedUsageData = await res.json().catch(() => null);
        } else if (url.includes('/v1/organizations') && !url.includes('/usage')) {
          const orgs = await res.json().catch(() => null);
          if (orgs?.data?.[0]?.title) {
            capturedOrgTitle = orgs.data[0].title;
          }
        } else if (url.includes('/wham/usage') || url.includes('/backend-api/usage') || url.includes('/usage_limit')) {
          const usageLimitData = await res.json().catch(() => null);
          if (usageLimitData) {
            if (typeof usageLimitData.used_percent === 'number') {
              capturedWeeklyUtilization = usageLimitData.used_percent;
            } else if (typeof usageLimitData.remaining_percent === 'number') {
              capturedWeeklyUtilization = 100 - usageLimitData.remaining_percent;
            }
            if (usageLimitData.resets_at) {
              capturedWeeklyResetsAt = usageLimitData.resets_at;
            }
          }
        }
      }
    } catch {
      // ignore response read errors
    }
  });

  await page.goto('https://platform.openai.com/login', { waitUntil: 'domcontentloaded' });

  const check = async () => {
    if (session.isProcessing || session.status === 'completed' || session.status === 'error') return;

    try {
      const url = page.url();
      const cookies = await context.cookies();
      const sessionTokenCookie = cookies.find(
        (c) => c.name === '__Secure-next-auth.session-token' || c.name === 'session-token' || c.name === '__Secure-auth.session-token'
      );

      const isInsidePlatform = url.includes('platform.openai.com') && !url.includes('/login') && !url.includes('/auth');
      const isInsideChatGPT = url.includes('chatgpt.com') && !url.includes('/login') && !url.includes('/auth');

      // If logged in to platform, auto-navigate to usage to trigger native authenticated requests
      if (isInsidePlatform && !hasNavigatedToUsage && !url.includes('/usage')) {
        hasNavigatedToUsage = true;
        session.statusMessage = 'Inicio de sesión detectado. Cargando métricas de OpenAI...';
        void page.goto('https://platform.openai.com/usage', { waitUntil: 'domcontentloaded' }).catch(() => {});
        return;
      }

      if (session.capturedBearer || sessionTokenCookie || isInsidePlatform || isInsideChatGPT) {
        session.isProcessing = true;
        session.status = 'extracting';
        session.statusMessage = 'Extrayendo datos de consumo de OpenAI / ChatGPT...';

        const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        const bearer = session.capturedBearer || sessionTokenCookie?.value || '';

        // Try extracting billing & usage directly inside the page (DOM + fetch)
        let snapshot: ApiUsageSnapshot | null = null;
        try {
          const billingInfo = await page.evaluate(
            async ({ token, orgId }) => {
              try {
                // Check DOM for subscription / weekly limit texts (e.g. "Límite de uso semanal: Un 96 % restante")
                const pageText = document.body.innerText || '';
                let domWeeklyUtilization: number | undefined;
                let domWeeklyResetsAt: string | undefined;

                const remainingMatch = pageText.match(/(?:l[íi]mite\s+de\s+uso\s+semanal|weekly\s+usage\s+limit)[\s\S]*?(?:un\s+)?(\d+(?:[.,]\d+)?)\s*%\s*restante/i);
                const usedMatch = pageText.match(/(?:l[íi]mite\s+de\s+uso\s+semanal|weekly\s+usage\s+limit)[\s\S]*?(?:un\s+)?(\d+(?:[.,]\d+)?)\s*%\s*(?:usado|consumido|used)/i);

                if (remainingMatch) {
                  const rem = parseFloat(remainingMatch[1].replace(',', '.'));
                  domWeeklyUtilization = Math.max(0, Math.min(100, 100 - rem));
                } else if (usedMatch) {
                  domWeeklyUtilization = parseFloat(usedMatch[1].replace(',', '.'));
                }

                const resetMatch = pageText.match(/(?:se\s+reinicia\s+en|resets?\s+(?:on|in|at))\s+([^\n\r]+)/i);
                if (resetMatch) {
                  domWeeklyResetsAt = resetMatch[1].trim();
                }

                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
                if (orgId) headers['OpenAI-Organization'] = orgId;

                // Organizations
                const orgsRes = await fetch('https://api.openai.com/v1/organizations', { credentials: 'include', headers })
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null);

                const activeOrg = orgId || orgsRes?.data?.[0]?.id || '';
                if (activeOrg) headers['OpenAI-Organization'] = activeOrg;

                const startTime = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

                const costsRes = await fetch(
                  `https://api.openai.com/v1/organization/costs?start_time=${startTime}&bucket_width=1d&limit=7`,
                  { credentials: 'include', headers }
                )
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null);

                const usageRes = await fetch(
                  `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&bucket_width=1d&limit=7`,
                  { credentials: 'include', headers }
                )
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null);

                // Endpoint clásico del dashboard de facturación: se hace con
                // fetch() dentro de la propia página (credentials: 'include'
                // manda las cookies de sesión reales), igual que el dashboard
                // oficial de OpenAI para mostrar el saldo — más fiable que
                // repetir la llamada desde el servidor con solo el bearer.
                const grantsRes = await fetch('https://api.openai.com/dashboard/billing/credit_grants', { credentials: 'include', headers })
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null);

                return { orgsRes, costsRes, usageRes, grantsRes, activeOrg, domWeeklyUtilization, domWeeklyResetsAt };
              } catch {
                return null;
              }
            },
            { token: bearer, orgId: capturedOrgId }
          );

          const costsData = capturedCostsData || billingInfo?.costsRes;
          const usageData = capturedUsageData || billingInfo?.usageRes;
          const grantsData = billingInfo?.grantsRes;
          const orgTitle = capturedOrgTitle || billingInfo?.orgsRes?.data?.[0]?.title || 'OpenAI';
          const weeklyUtil = capturedWeeklyUtilization ?? billingInfo?.domWeeklyUtilization;
          const weeklyResetsAt = capturedWeeklyResetsAt ?? billingInfo?.domWeeklyResetsAt;
          const balance = typeof grantsData?.total_available === 'number' ? grantsData.total_available : undefined;

          if (weeklyUtil !== undefined) {
            snapshot = {
              fetchedAt: new Date().toISOString(),
              weeklyUtilization: weeklyUtil,
              weeklyResetsAt,
              planType: 'ChatGPT / OpenAI Workspace',
              balance,
              currency: balance !== undefined ? 'USD' : undefined,
              unavailable: ['accumulatedCost', 'tokensUsed', 'requestCount', ...(balance === undefined ? ['balance'] : [])],
            };
          } else if (costsData || usageData || grantsData) {
            let accumulatedCost = 0;
            let currency = 'USD';
            if (costsData?.data) {
              for (const bucket of costsData.data) {
                for (const result of bucket.results ?? []) {
                  if (result.amount) {
                    accumulatedCost += result.amount.value ?? 0;
                    if (result.amount.currency) currency = result.amount.currency.toUpperCase();
                  }
                }
              }
            }

            let tokensUsed = 0;
            let requestCount = 0;
            if (usageData?.data) {
              for (const bucket of usageData.data) {
                for (const result of bucket.results ?? []) {
                  tokensUsed += (result.input_tokens ?? 0) + (result.output_tokens ?? 0);
                  requestCount += result.num_model_requests ?? 0;
                }
              }
            }

            snapshot = {
              fetchedAt: new Date().toISOString(),
              balance,
              accumulatedCost,
              currency,
              tokensUsed,
              requestCount,
              planType: orgTitle,
              unavailable: balance === undefined ? ['balance'] : [],
            };
          }
        } catch {
          // ignore in-page error
        }

        const secretPayload = JSON.stringify({
          accessToken: bearer,
          organizationId: capturedOrgId,
          cookie: cookieString,
          cachedSnapshot: snapshot,
        });

        await saveSecretForProvider(session.providerId, secretPayload);

        // Fallback to fetchOpenAIUsage
        if (!snapshot && bearer) {
          try {
            snapshot = await fetchOpenAIUsage(secretPayload);
          } catch (e) {
            console.warn('[openai] fetchOpenAIUsage fallback warning:', e);
          }
        }

        if (!snapshot) {
          snapshot = {
            fetchedAt: new Date().toISOString(),
            planType: capturedOrgTitle || 'OpenAI / ChatGPT (Conectado)',
            currency: 'USD',
            unavailable: ['balance', 'tokensUsed', 'requestCount'],
          };
        }

        session.usageSnapshot = snapshot;
        session.status = 'completed';
        session.statusMessage = '¡Sesión de OpenAI vinculada y datos obtenidos correctamente!';

        if (session.checkInterval) clearInterval(session.checkInterval);

        setTimeout(() => {
          cleanupSession(session.id, true);
        }, 1500);
      }
    } catch (err) {
      session.isProcessing = false;
      console.error('[openai-check-err]', err);
    }
  };

  session.checkInterval = setInterval(() => void check(), 1000);
}

// -------------------------------------------------------------
// GOOGLE GEMINI LOGIN FLOW
// -------------------------------------------------------------
async function setupGeminiLogin(session: BrowserLoginSession) {
  const page = session.page!;
  const context = session.context!;

  // 1. Detección automática instantánea si Antigravity IDE está abierto
  try {
    const antigravitySnapshot = await fetchAntigravityUsage();
    if (antigravitySnapshot) {
      session.isProcessing = true;
      session.status = 'extracting';
      session.statusMessage = 'Detectado Antigravity en ejecución. Extrayendo cuotas...';

      const secretPayload = JSON.stringify({
        antigravity: true,
        planType: antigravitySnapshot.planType,
        cachedSnapshot: antigravitySnapshot,
      });

      await saveSecretForProvider(session.providerId, secretPayload);

      session.usageSnapshot = antigravitySnapshot;
      session.status = 'completed';
      session.statusMessage = '¡Límites de Antigravity / Google Gemini vinculados correctamente!';

      setTimeout(() => {
        cleanupSession(session.id, true);
      }, 1200);
      return;
    }
  } catch (err) {
    console.warn('[gemini-login] Antigravity auto-check warning:', err);
  }

  session.status = 'waiting_user_login';
  session.statusMessage = 'Inicia sesión con tu cuenta de Google en Gemini (o abre tus "Límites de uso")...';

  await page.goto('https://gemini.google.com', { waitUntil: 'domcontentloaded' });

  const check = async () => {
    if (session.isProcessing || session.status === 'completed' || session.status === 'error') return;

    try {
      const url = page.url();
      const isGemini = url.includes('gemini.google.com') && !url.includes('accounts.google.com');
      const isAIStudio = url.includes('aistudio.google.com') && !url.includes('accounts.google.com');

      if (isGemini || isAIStudio) {
        const cookies = await context.cookies();
        const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

        // Check DOM on gemini.google.com for usage limits
        const domInfo = await page.evaluate(() => {
          try {
            const pageText = document.body.innerText || '';

            let domWeeklyUtilization: number | undefined;
            let domSessionUtilization: number | undefined;
            let domWeeklyResetsAt: string | undefined;
            let domSessionResetsAt: string | undefined;
            let detectedPlan = 'Google Gemini Pro';

            if (/l[íi]mites\s+de\s+uso\s*ADVANCED/i.test(pageText) || /gemini\s+advanced/i.test(pageText)) {
              detectedPlan = 'Google Gemini Advanced';
            } else if (/l[íi]mites\s+de\s+uso\s*PRO/i.test(pageText) || /gemini\s+pro/i.test(pageText)) {
              detectedPlan = 'Google Gemini Pro';
            } else if (/l[íi]mites\s+de\s+uso/i.test(pageText)) {
              detectedPlan = 'Google Gemini';
            }

            // Match "Uso actual" -> "0 % usado" or "0% usado"
            const currentUsedMatch = pageText.match(/(?:uso\s+actual|current\s+usage)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(?:usado|used)/i);
            const currentRemainingMatch = pageText.match(/(?:uso\s+actual|current\s+usage)[\s\S]*?(?:un\s+)?(\d+(?:[.,]\d+)?)\s*%\s*restante/i);

            if (currentUsedMatch) {
              domSessionUtilization = parseFloat(currentUsedMatch[1].replace(',', '.'));
            } else if (currentRemainingMatch) {
              domSessionUtilization = 100 - parseFloat(currentRemainingMatch[1].replace(',', '.'));
            }

            const currentResetMatch = pageText.match(/(?:uso\s+actual|current\s+usage)[\s\S]*?(?:se\s+restablece\s+(?:a\s+las|el)?|resets?\s+(?:at|in)?)\s+([^\n\r]+)/i);
            if (currentResetMatch) {
              domSessionResetsAt = currentResetMatch[1].trim();
            }

            // Match "Límite semanal" -> "0 % usado"
            const weeklyUsedMatch = pageText.match(/(?:l[íi]mite\s+semanal|weekly\s+limit)[\s\S]*?(\d+(?:[.,]\d+)?)\s*%\s*(?:usado|used)/i);
            const weeklyRemainingMatch = pageText.match(/(?:l[íi]mite\s+semanal|weekly\s+limit)[\s\S]*?(?:un\s+)?(\d+(?:[.,]\d+)?)\s*%\s*restante/i);

            if (weeklyUsedMatch) {
              domWeeklyUtilization = parseFloat(weeklyUsedMatch[1].replace(',', '.'));
            } else if (weeklyRemainingMatch) {
              domWeeklyUtilization = 100 - parseFloat(weeklyRemainingMatch[1].replace(',', '.'));
            }

            const weeklyResetMatch = pageText.match(/(?:l[íi]mite\s+semanal|weekly\s+limit)[\s\S]*?(?:se\s+restablece\s+(?:el|a\s+las)?|resets?\s+(?:on|in)?)\s+([^\n\r]+)/i);
            if (weeklyResetMatch) {
              domWeeklyResetsAt = weeklyResetMatch[1].trim();
            }

            // Also check localStorage for AI Studio key
            let extractedKey = '';
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i) || '';
              const v = localStorage.getItem(k) || '';
              if (v.startsWith('AIzaSy')) extractedKey = v;
            }

            const hasLimitsText = /l[íi]mites\s+de\s+uso|uso\s+actual|l[íi]mite\s+semanal/i.test(pageText);
            const isLoggedIn = /pregunta\s+a\s+gemini|nueva\s+conversaci[óo]n|\bpro\b/i.test(pageText) || pageText.includes('Pedro');

            return {
              hasLimitsText,
              isLoggedIn,
              detectedPlan,
              domWeeklyUtilization,
              domSessionUtilization,
              domWeeklyResetsAt,
              domSessionResetsAt,
              extractedKey,
            };
          } catch {
            return null;
          }
        });

        const hasUsageData =
          domInfo?.domWeeklyUtilization !== undefined ||
          domInfo?.domSessionUtilization !== undefined ||
          domInfo?.domWeeklyResetsAt !== undefined ||
          domInfo?.domSessionResetsAt !== undefined;

        const isInsideApp = url.includes('gemini.google.com/app') || (domInfo?.isLoggedIn ?? false);

        if (hasUsageData || domInfo?.hasLimitsText) {
          session.isProcessing = true;
          session.status = 'extracting';
          session.statusMessage = 'Límites de Gemini detectados. Guardando...';

          const snapshot: ApiUsageSnapshot = {
            fetchedAt: new Date().toISOString(),
            weeklyUtilization: domInfo?.domWeeklyUtilization ?? 0,
            sessionUtilization: domInfo?.domSessionUtilization ?? 0,
            weeklyResetsAt: domInfo?.domWeeklyResetsAt,
            sessionResetsAt: domInfo?.domSessionResetsAt,
            planType: domInfo?.detectedPlan || 'Google Gemini Pro',
            unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'],
          };

          const secretPayload = JSON.stringify({
            apiKey: domInfo?.extractedKey || '',
            cookie: cookieString,
            cachedSnapshot: snapshot,
            planType: domInfo?.detectedPlan || 'Google Gemini Pro',
          });

          await saveSecretForProvider(session.providerId, secretPayload);

          session.usageSnapshot = snapshot;
          session.status = 'completed';
          session.statusMessage = '¡Límites de Google Gemini vinculados correctamente!';

          if (session.checkInterval) clearInterval(session.checkInterval);

          setTimeout(() => {
            cleanupSession(session.id, true);
          }, 1500);
          return;
        }

        if (isInsideApp) {
          session.statusMessage = 'Sesión de Gemini detectada. Pulsa Ajustes (⚙️) > "Límites de uso" o "Detectar ahora"...';

          // Try clicking the settings / limits element automatically
          try {
            await page.evaluate(() => {
              const allElements = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
              const limitsBtn = allElements.find((el) => {
                const text = (el.textContent || '').trim().toLowerCase();
                return text === 'límites de uso' || text === 'usage limits' || text.includes('límites de uso');
              });
              if (limitsBtn) {
                (limitsBtn as HTMLElement).click();
                return;
              }

              const gearBtn = allElements.find((el) => {
                const label = (el.getAttribute('aria-label') || '').toLowerCase();
                const icon = (el.textContent || '').trim();
                return label.includes('ajustes') || label.includes('configuración') || label.includes('settings') || icon === 'settings';
              });
              if (gearBtn) {
                (gearBtn as HTMLElement).click();
              }
            });
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      session.isProcessing = false;
      console.error('[gemini-check-err]', err);
    }
  };

  session.checkInterval = setInterval(() => void check(), 1000);
}

// -------------------------------------------------------------
// DEEPSEEK LOGIN FLOW
// -------------------------------------------------------------
async function setupDeepSeekLogin(session: BrowserLoginSession) {
  const page = session.page!;
  const context = session.context!;

  session.status = 'waiting_user_login';
  session.statusMessage = 'Inicia sesión con tu cuenta en la consola de DeepSeek (Usage)...';

  let capturedCost: number | undefined;
  let capturedTokens: number | undefined;
  let capturedRequests: number | undefined;
  let capturedBalance: number | undefined;
  let capturedGrantedBalance: number | undefined;
  let capturedToppedUpBalance: number | undefined;
  let capturedCurrency: string | undefined;

  // Intercept internal platform API calls (best-effort: field names are not
  // officially documented, la extracción del DOM de abajo es la fuente principal)
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (res.ok() && url.includes('platform.deepseek.com/api/v0/')) {
        const data = await res.json().catch(() => null);
        if (data) {
          const info = data.balance_infos?.[0];
          if (info) {
            capturedBalance = Number(info.total_balance);
            capturedGrantedBalance = Number(info.granted_balance);
            capturedToppedUpBalance = Number(info.topped_up_balance);
            if (info.currency) capturedCurrency = info.currency;
          }
          if (typeof data.total_cost === 'number') capturedCost = data.total_cost;
          if (typeof data.total_tokens === 'number') capturedTokens = data.total_tokens;
          if (typeof data.total_requests === 'number') capturedRequests = data.total_requests;
        }
      }
    } catch {
      // ignore
    }
  });

  await page.goto('https://platform.deepseek.com/sign_in', { waitUntil: 'domcontentloaded' });

  const check = async () => {
    if (session.isProcessing || session.status === 'completed' || session.status === 'error') return;

    try {
      const url = page.url();
      const isLoggedOut = url.includes('sign_in') || url.includes('login') || url.includes('accounts.google.com');
      const isDeepSeekPlatform = url.includes('platform.deepseek.com');

      if (!isLoggedOut && isDeepSeekPlatform) {
        // If logged in to platform, auto-navigate to /usage if not there yet
        if (!url.includes('/usage')) {
          session.statusMessage = 'Inicio de sesión detectado. Abriendo consumo de DeepSeek...';
          void page.goto('https://platform.deepseek.com/usage', { waitUntil: 'domcontentloaded' }).catch(() => {});
          return;
        }

        const allCookies = await context.cookies();
        const deepseekCookies = allCookies.filter((c) => c.domain.includes('deepseek.com'));
        const cookieString = allCookies.map((c) => `${c.name}=${c.value}`).join('; ');

        // DeepSeek autentica la SPA con un token en localStorage (típico de un login
        // por popup de Google OAuth, donde las cookies de terceros no sirven), no con
        // una cookie de sesión propia. Guardamos todo localStorage de este origen para
        // poder restaurarlo en refrescos posteriores sin repetir el login interactivo.
        const pageInfo = await page.evaluate(() => {
          const pageText = document.body.innerText || document.body.textContent || '';
          let extractedKey = '';
          const localStorageDump: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) || '';
            const v = localStorage.getItem(k) || '';
            if (v.startsWith('sk-')) extractedKey = v;
            if (k && v.length < 20000) localStorageDump[k] = v;
          }
          return { pageText, extractedKey, localStorageDump };
        });

        const domInfo = parseDeepSeekUsageText(pageInfo.pageText);
        const hasUsageData =
          domInfo.cost !== undefined ||
          domInfo.tokens !== undefined ||
          domInfo.requests !== undefined ||
          domInfo.toppedUpBalance !== undefined;

        if (hasUsageData) {
          const finalCost = capturedCost ?? domInfo.cost;
          const finalTokens = capturedTokens ?? domInfo.tokens;
          const finalRequests = capturedRequests ?? domInfo.requests;
          const finalToppedUp = capturedToppedUpBalance ?? domInfo.toppedUpBalance;
          const finalBalance = capturedBalance ?? finalToppedUp;
          const finalCurrency = capturedCurrency ?? domInfo.currency ?? 'USD';

          session.isProcessing = true;
          session.status = 'extracting';
          session.statusMessage = 'Métricas de DeepSeek detectadas. Guardando...';

          const snapshot: ApiUsageSnapshot = {
            fetchedAt: new Date().toISOString(),
            accumulatedCost: finalCost,
            tokensUsed: finalTokens,
            requestCount: finalRequests,
            balance: finalBalance,
            grantedBalance: capturedGrantedBalance,
            toppedUpBalance: finalToppedUp,
            currency: finalCurrency,
            planType: 'DeepSeek Platform',
            tier: 'Pay-as-you-go',
            unavailable: [
              ...(finalCost === undefined ? ['accumulatedCost'] : []),
              ...(finalTokens === undefined ? ['tokensUsed'] : []),
              ...(finalRequests === undefined ? ['requestCount'] : []),
            ],
          };

          const secretPayload = JSON.stringify({
            apiKey: pageInfo.extractedKey || '',
            cookie: cookieString,
            cookies: deepseekCookies,
            localStorage: pageInfo.localStorageDump,
            cachedSnapshot: snapshot,
            planType: 'DeepSeek Platform',
          });

          await saveSecretForProvider(session.providerId, secretPayload);

          session.usageSnapshot = snapshot;
          session.status = 'completed';
          session.statusMessage = '¡Consumo y saldo de DeepSeek vinculados correctamente!';

          if (session.checkInterval) clearInterval(session.checkInterval);

          setTimeout(() => {
            cleanupSession(session.id, true);
          }, 1500);
        }
      }
    } catch (err) {
      session.isProcessing = false;
      console.error('[deepseek-check-err]', err);
    }
  };

  session.checkInterval = setInterval(() => void check(), 1000);
}

// -------------------------------------------------------------
// SESSION CONTROL & ACTIONS
// -------------------------------------------------------------
export async function forceCheckSession(sessionId: string): Promise<{
  status: BrowserLoginState;
  statusMessage: string;
  usageSnapshot?: ApiUsageSnapshot;
  error?: string;
}> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return {
      status: 'error',
      statusMessage: 'Sesión no encontrada.',
      error: 'Sesión no encontrada.',
    };
  }

  // Force trigger extraction based on provider
  if (session.page && session.context) {
    session.isProcessing = false;
    if (session.provider === 'claude-pro' || session.provider === 'anthropic') {
      await setupClaudeLogin(session);
    } else if (session.provider === 'openai') {
      await setupOpenAILogin(session);
    } else if (session.provider === 'gemini') {
      await setupGeminiLogin(session);
    } else if (session.provider === 'deepseek') {
      await setupDeepSeekLogin(session);
    }
  }

  return getBrowserLoginStatus(sessionId);
}

export function getBrowserLoginStatus(sessionId: string): {
  status: BrowserLoginState;
  statusMessage: string;
  usageSnapshot?: ApiUsageSnapshot;
  error?: string;
} {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return {
      status: 'error',
      statusMessage: 'Sesión no encontrada o expirada.',
      error: 'Sesión no encontrada.',
    };
  }

  return {
    status: session.status,
    statusMessage: session.statusMessage,
    usageSnapshot: session.usageSnapshot,
    error: session.error,
  };
}

export async function cancelBrowserLogin(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = 'cancelled';
    session.statusMessage = 'Cancelado por el usuario.';
    cleanupSession(sessionId, true);
  }
}

function cleanupSession(sessionId: string, closeBrowser = true) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  if (session.checkInterval) {
    clearInterval(session.checkInterval);
    session.checkInterval = undefined;
  }

  if (session.timeoutTimer) {
    clearTimeout(session.timeoutTimer);
    session.timeoutTimer = undefined;
  }

  if (closeBrowser && (session.browser || session.context)) {
    // Cerramos primero el contexto efímero y después el proceso Playwright
    // para no dejar navegadores huérfanos tras finalizar o cancelar el login.
    const context = session.context;
    const browser = session.browser;
    session.browser = undefined;
    session.context = undefined;
    session.page = undefined;
    void (async () => {
      try {
        await context?.close();
      } catch {
        // ignore
      }
      try {
        await browser?.close();
      } catch {
        // ignore
      }
    })();
  }

  // Keep result in memory for 5 minutes so polling clients receive final status, then delete
  setTimeout(() => {
    activeSessions.delete(sessionId);
  }, 5 * 60 * 1000);
}
