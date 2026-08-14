import { Browser, Page } from 'playwright';
import { launchAvailableChromium } from '@/lib/playwright-browser.server';

// Flags estándar de Chromium para evitar que trate esta página como "en
// segundo plano" y le recorte el reloj de JS/temporizadores. Sin esto, el SPA
// de DeepSeek (perfil de usuario, saldo, coste) puede quedarse sin terminar
// de hidratar indefinidamente cuando este proceso headless corre como hijo
// de otro proceso con ventana (Electron) que compite por el mismo throttling
// de "aplicación en segundo plano" del sistema operativo.
const ANTI_THROTTLE_ARGS = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

export async function launchDeepSeekChromium(): Promise<Browser> {
  return launchAvailableChromium({ headless: true, args: ANTI_THROTTLE_ARGS });
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
