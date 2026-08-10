import { chromium, Browser, Page } from 'playwright';
import { spawnSync } from 'child_process';
import path from 'path';

function installChromium(): void {
  // Ver el comentario equivalente en claude-pro.server.ts: cli.js no está en el
  // exports map del paquete, así que hay que resolverlo vía el entry point.
  const cliPath = path.join(path.dirname(require.resolve('playwright')), 'cli.js');
  const result = spawnSync(process.execPath, [cliPath, 'install', 'chromium'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PKG_EXECPATH: 'PKG_INVOKE_NODEJS',
    },
  });
  if (result.status !== 0) {
    throw new Error('No se pudo descargar Chromium automáticamente. Ejecuta "npx playwright install chromium" y vuelve a intentarlo.');
  }
}

export async function launchDeepSeekChromium(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('Executable doesn')) throw err;
    installChromium();
    return chromium.launch({ headless: true });
  }
}

export interface DeepSeekScrapedUsage {
  cost?: number;
  tokens?: number;
  requests?: number;
  toppedUpBalance?: number;
  currency?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '¥': 'CNY', '€': 'EUR' };

function findAmount(lines: string[], labelPattern: RegExp, lookahead = 6): { value: number; currency?: string } | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!labelPattern.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 1 + lookahead); j++) {
      const m = lines[j].match(/([$¥€])\s*([\d,]+(?:\.\d+)?)/);
      if (m) {
        return { value: parseFloat(m[2].replace(/,/g, '')), currency: CURRENCY_SYMBOLS[m[1]] };
      }
    }
  }
  return undefined;
}

function findCount(lines: string[], labelPattern: RegExp, lookahead = 6): number | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!labelPattern.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 1 + lookahead); j++) {
      const stripped = lines[j].replace(labelPattern, '').trim();
      const m = stripped.match(/^([\d,]+)$/);
      if (m) {
        const val = parseInt(m[1].replace(/,/g, ''), 10);
        if (!Number.isNaN(val)) return val;
      }
    }
  }
  return undefined;
}

/**
 * Escanea el texto plano de la página de uso de DeepSeek buscando cada etiqueta
 * conocida ("Topped-up balance", "Total cost"/"Cost", "API requests", "Tokens") y
 * el primer importe/cantidad que aparece en las siguientes líneas. Tolera que la
 * etiqueta y el valor estén en la misma línea o separados por elementos de UI
 * (iconos, tooltips, botones) que rompen un emparejamiento línea-a-línea estricto.
 */
export function parseDeepSeekUsageText(pageText: string): DeepSeekScrapedUsage {
  if (!pageText.includes('Topped-up balance') && !pageText.includes('Total cost') && !/^Cost\b/m.test(pageText)) {
    return {};
  }

  const lines = pageText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const balanceMatch = findAmount(lines, /^Topped-up\s+balance/i);
  const costMatch = findAmount(lines, /^(Total\s+cost|Cost)\b/i);
  const requests = findCount(lines, /^API\s+requests\b/i);
  const tokens = findCount(lines, /^Tokens\b/i);

  return {
    toppedUpBalance: balanceMatch?.value,
    cost: costMatch?.value,
    requests,
    tokens,
    currency: balanceMatch?.currency ?? costMatch?.currency,
  };
}

export async function scrapeDeepSeekUsage(page: Page): Promise<DeepSeekScrapedUsage> {
  const pageText = await page.evaluate(() => document.body.innerText || document.body.textContent || '');
  return parseDeepSeekUsageText(pageText);
}
