import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import path from 'path';
import { ApiUsageSnapshot } from '@/types/api';

// El Chromium de Playwright pesa ~300MB: no va empaquetado dentro del .exe
// ni del repo (rompería un `git push` normal en GitHub). Se descarga una
// sola vez, bajo demanda, al cache estandar de Playwright en este equipo
// (necesita internet la primera vez que se usa la tarjeta de Claude Pro).
function installChromium(): void {
  // Next rewrites require.resolve('playwright') to a numeric webpack module id.
  // The full package is copied next to the standalone server, and this path
  // also exists at the repository root during development.
  const cliPath = path.join(process.cwd(), 'node_modules', 'playwright', 'cli.js');
  const result = spawnSync(process.execPath, [cliPath, 'install', 'chromium'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Truco de pkg: si process.execPath es el propio dashboard.exe
      // empaquetado, esta variable hace que se comporte como `node <script>`
      // normal en vez de relanzar el snapshot del launcher. No-op si ya es
      // un node.exe real (desarrollo).
      PKG_EXECPATH: 'PKG_INVOKE_NODEJS',
    },
  });
  if (result.status !== 0) {
    throw new Error(
      'No se pudo descargar Chromium automáticamente. Ejecuta manualmente "npx playwright install chromium" y vuelve a intentarlo.'
    );
  }
}

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('Executable doesn')) throw err;
    installChromium();
    return chromium.launch({ headless: true });
  }
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
