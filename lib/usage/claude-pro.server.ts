import { ApiUsageSnapshot } from '@/types/api';
import { launchAvailableChromium } from '@/lib/playwright-browser.server';
import { resolveBrokerConfig, fetchSessionUrls } from '@/lib/cred-broker-client';

async function launchChromium() {
  return launchAvailableChromium({ headless: true });
}

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BLOCKED_SIGNATURES = [
  {
    pattern: 'Just a moment',
    error: 'Cloudflare bloqueó la petición (protección anti-bot). Reintenta en unos minutos.',
  },
  {
    pattern: 'Enable JavaScript and cookies to continue',
    error: 'Cloudflare pidió un reto JS/cookies que no se pudo superar.',
  },
];

interface ClaudeOrganization {
  uuid: string;
}

interface ClaudeUsageWindow {
  utilization?: number;
  resets_at?: string;
}

interface ClaudeUsageResponse {
  five_hour?: ClaudeUsageWindow;
  seven_day?: ClaudeUsageWindow;
}

function parseBody<T>(bodyText: string): T {
  for (const sig of BLOCKED_SIGNATURES) {
    if (bodyText.includes(sig.pattern)) {
      throw new Error(sig.error);
    }
  }
  try {
    return JSON.parse(bodyText) as T;
  } catch {
    if (bodyText.includes('<html')) {
      throw new Error('La cookie de sesión no es válida o ha caducado. Vuelve a copiarla desde claude.ai.');
    }
    throw new Error('Respuesta inesperada de claude.ai (puede que hayan cambiado su API interna).');
  }
}

function normalizeUtilization(val?: number): number | undefined {
  if (val === undefined || val === null || Number.isNaN(val)) return undefined;
  if (val > 0 && val <= 1) {
    return Math.round(val * 100);
  }
  return Math.min(100, Math.max(0, Math.round(val)));
}

import { fetchClaudeOAuthUsage } from './claude-oauth.server';

export async function fetchClaudeProUsage(sessionKey: string): Promise<ApiUsageSnapshot> {
  const cleanKey = sessionKey.trim();

  // Si se pasa un token OAuth o si no es una sessionKey estricta, o si hay credenciales locales de Claude
  if (cleanKey.startsWith('sk-ant-oat') || cleanKey.startsWith('oauth_') || !cleanKey.startsWith('sk-ant-sid')) {
    try {
      return await fetchClaudeOAuthUsage(cleanKey);
    } catch {
      // continuar con fallback
    }
  }

  // Intento preferente de OAuth local incluso si la key en dashboard era una sessionKey caducada
  try {
    return await fetchClaudeOAuthUsage();
  } catch {
    // continuar con sessionKey
  }

  const fetchedAt = new Date().toISOString();

  // Ruta 1 (widget Electron / broker): se fija la cookie en la sesión del
  // proceso principal y se consulta con una ventana oculta real (Chromium con
  // user-agent Chrome y la cookie de sesión), lo que evita que Cloudflare
  // bloquee la petición. Es el mismo enfoque del widget de referencia.
  const broker = resolveBrokerConfig(process.env);
  if (broker) {
    const cookies = [
      {
        url: 'https://claude.ai',
        name: 'sessionKey',
        value: sessionKey,
        domain: '.claude.ai',
        path: '/',
        secure: true,
        httpOnly: true,
      },
    ];
    try {
      const [orgs] = await fetchSessionUrls(broker, {
        cookies,
        urls: ['https://claude.ai/api/organizations'],
      });
      const organizationId = Array.isArray(orgs) ? orgs[0]?.uuid : orgs?.uuid;
      if (!organizationId) {
        throw new Error('No se encontró ninguna organización en tu cuenta de claude.ai.');
      }
      const [usage] = await fetchSessionUrls(broker, {
        cookies,
        urls: [`https://claude.ai/api/organizations/${organizationId}/usage`],
      });
      return {
        fetchedAt,
        sessionUtilization: normalizeUtilization(usage?.five_hour?.utilization),
        weeklyUtilization: normalizeUtilization(usage?.seven_day?.utilization),
        sessionResetsAt: usage?.five_hour?.resets_at,
        weeklyResetsAt: usage?.seven_day?.resets_at,
        planType: 'Claude Pro',
        unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Cloudflare|InvalidJSON|session[^a-z]/i.test(message)) {
        throw new Error(`La sesión de claude.ai no es válida o caducó (${message}). Vuelve a iniciar sesión.`);
      }
      throw error;
    }
  }

  // Ruta 2 (desarrollo web sin Electron): Playwright efímero.
  const browser = await launchChromium();
  try {
    const context = await browser.newContext({ userAgent: CHROME_USER_AGENT });
    await context.addCookies([
      {
        name: 'sessionKey',
        value: sessionKey,
        domain: '.claude.ai',
        path: '/',
        httpOnly: true,
        secure: true,
      },
    ]);

    const page = await context.newPage();

    await page.goto('https://claude.ai/api/organizations', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const orgsBody = await page.evaluate(() => document.body.innerText || document.body.textContent || '');
    const orgs = parseBody<ClaudeOrganization[]>(orgsBody);
    const organizationId = orgs?.[0]?.uuid;
    if (!organizationId) {
      throw new Error('No se encontró ninguna organización en tu cuenta de claude.ai.');
    }

    await page.goto(`https://claude.ai/api/organizations/${organizationId}/usage`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    const usageBody = await page.evaluate(() => document.body.innerText || document.body.textContent || '');
    const usage = parseBody<ClaudeUsageResponse>(usageBody);

    return {
      fetchedAt,
      sessionUtilization: normalizeUtilization(usage.five_hour?.utilization),
      weeklyUtilization: normalizeUtilization(usage.seven_day?.utilization),
      sessionResetsAt: usage.five_hour?.resets_at,
      weeklyResetsAt: usage.seven_day?.resets_at,
      planType: 'Claude Pro',
      unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'],
    };
  } finally {
    await browser.close();
  }
}
