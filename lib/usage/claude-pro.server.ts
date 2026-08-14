import { ApiUsageSnapshot } from '@/types/api';
import { launchAvailableChromium } from '@/lib/playwright-browser.server';

async function launchChromium() {
  return launchAvailableChromium({ headless: true });
}

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BLOCKED_SIGNATURES = [
  { pattern: 'Just a moment', error: 'Cloudflare bloqueó la petición (protección anti-bot). Reintenta en unos minutos.' },
  { pattern: 'Enable JavaScript and cookies to continue', error: 'Cloudflare pidió un reto JS/cookies que no se pudo superar.' },
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

export async function fetchClaudeProUsage(sessionKey: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();

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
      sessionUtilization: usage.five_hour?.utilization,
      weeklyUtilization: usage.seven_day?.utilization,
      sessionResetsAt: usage.five_hour?.resets_at,
      weeklyResetsAt: usage.seven_day?.resets_at,
      unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount'],
    };
  } finally {
    await browser.close();
  }
}
