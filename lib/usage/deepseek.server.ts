import { ApiUsageSnapshot } from '@/types/api';
import { launchDeepSeekChromium, scrapeDeepSeekUsage } from './deepseek-scrape.server';

interface DeepSeekBalanceInfo {
  currency: 'USD' | 'CNY';
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

interface DeepSeekBalanceResponse {
  is_available: boolean;
  balance_infos: DeepSeekBalanceInfo[];
}

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface DeepSeekStoredSecret {
  apiKey?: string;
  cookie?: string;
  cookies?: StoredCookie[];
  localStorage?: Record<string, string>;
  cachedSnapshot?: ApiUsageSnapshot;
}

async function fetchOfficialBalance(apiKey: string): Promise<Partial<ApiUsageSnapshot> | null> {
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DeepSeekBalanceResponse;
    const info = data.balance_infos?.[0];
    if (!info) return null;
    return {
      balance: Number(info.total_balance),
      grantedBalance: Number(info.granted_balance),
      toppedUpBalance: Number(info.topped_up_balance),
      currency: info.currency,
    };
  } catch {
    return null;
  }
}

/**
 * Reconstruye cookies "nombre=valor; ..." planas (formato legado, de antes de que
 * guardásemos las cookies estructuradas). Usa `url` en vez de `domain`+`path` para
 * que Chrome las trate como host-only: los cookies con prefijo "__Secure-"/"__Host-"
 * (típicos en logins con OAuth) son rechazados por Storage.setCookies si se les
 * asigna un dominio con punto inicial sin marcarlos `secure`.
 */
function cookiesFromFlatString(cookieString: string): StoredCookie[] {
  const result: StoredCookie[] = [];
  for (const pair of cookieString.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name || !value) continue;
    const secure: boolean = name.startsWith('__Secure-') || name.startsWith('__Host-');
    result.push({ name, value, domain: 'platform.deepseek.com', path: '/', secure });
  }
  return result;
}

/** Aplica las cookies al contexto una a una para que una sola cookie inválida no tumbe el resto. */
async function addCookiesSafely(context: import('playwright').BrowserContext, cookies: StoredCookie[]): Promise<number> {
  try {
    await context.addCookies(cookies);
    return cookies.length;
  } catch {
    let applied = 0;
    for (const cookie of cookies) {
      try {
        await context.addCookies([cookie]);
        applied++;
      } catch {
        // Cookie individual incompatible (prefijo especial, dominio, etc.): se omite.
      }
    }
    return applied;
  }
}

/**
 * Vuelve a abrir la página de uso de DeepSeek con la sesión guardada para leer
 * coste, tokens y peticiones en vivo. DeepSeek no expone estos datos en ninguna
 * API pública, así que el navegador headless es la única fuente.
 *
 * DeepSeek autentica su SPA con un token en localStorage (típico de un login por
 * popup de Google OAuth), no con una cookie de sesión propia — por eso hay que
 * restaurar localStorage además de las cookies, o la sesión no se reconoce.
 */
async function scrapeLiveDeepSeekUsage(
  cookies: StoredCookie[],
  localStorageData: Record<string, string>
): Promise<Partial<ApiUsageSnapshot> | null> {
  if (!cookies.length && Object.keys(localStorageData).length === 0) return null;

  const browser = await launchDeepSeekChromium();
  try {
    const context = await browser.newContext();
    if (cookies.length) await addCookiesSafely(context, cookies);

    const page = await context.newPage();

    if (Object.keys(localStorageData).length) {
      // localStorage solo se puede escribir una vez cargado el origen correspondiente.
      await page.goto('https://platform.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 12000 });
      await page.evaluate((data) => {
        for (const [key, value] of Object.entries(data)) {
          try {
            localStorage.setItem(key, value);
          } catch {
            // almacenamiento lleno o clave inválida: se ignora esa entrada
          }
        }
      }, localStorageData);
    }

    await page.goto('https://platform.deepseek.com/usage', { waitUntil: 'domcontentloaded', timeout: 12000 });

    const currentUrl = page.url();
    if (currentUrl.includes('sign_in') || currentUrl.includes('login')) {
      // La cookie ya no es válida: nos redirigió a la pantalla de login.
      return null;
    }

    // SPA: esperamos a que los datos de uso terminen de pintarse en vez de
    // depender de "networkidle" (DeepSeek mantiene peticiones de fondo que
    // nunca dejan la red inactiva y harían expirar el timeout).
    await page
      .waitForFunction(() => (document.body.innerText || '').includes('Topped-up balance'), { timeout: 8000 })
      .catch(() => {});

    const scraped = await scrapeDeepSeekUsage(page);
    if (
      scraped.cost === undefined &&
      scraped.tokens === undefined &&
      scraped.requests === undefined &&
      scraped.toppedUpBalance === undefined
    ) {
      return null;
    }

    return {
      accumulatedCost: scraped.cost,
      tokensUsed: scraped.tokens,
      requestCount: scraped.requests,
      balance: scraped.toppedUpBalance,
      toppedUpBalance: scraped.toppedUpBalance,
      currency: scraped.currency,
    };
  } catch {
    // Fallo inesperado del navegador (timeout, navegación, etc.): tratamos como "sin datos en vivo".
    return null;
  } finally {
    await browser.close();
  }
}

export async function fetchDeepSeekUsage(secret: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();
  let token = secret.trim();
  let cookies: StoredCookie[] = [];
  let localStorageData: Record<string, string> = {};
  let cached: ApiUsageSnapshot | undefined;

  if (token.startsWith('{')) {
    try {
      const parsed = JSON.parse(token) as DeepSeekStoredSecret;
      cached = parsed.cachedSnapshot;
      cookies = parsed.cookies?.length ? parsed.cookies : parsed.cookie ? cookiesFromFlatString(parsed.cookie) : [];
      localStorageData = parsed.localStorage ?? {};
      token = parsed.apiKey ?? '';
    } catch {
      token = '';
    }
  }

  const hasRealApiKey = token.startsWith('sk-');
  const hasBrowserSession = cookies.length > 0 || Object.keys(localStorageData).length > 0;

  // DeepSeek no tiene API pública para coste/tokens/peticiones: si tenemos una
  // sesión de navegador guardada, la volvemos a abrir para leer datos frescos
  // en cada "Actualizar" en vez de repetir para siempre el snapshot inicial.
  if (hasBrowserSession) {
    const live = await scrapeLiveDeepSeekUsage(cookies, localStorageData);
    if (live) {
      const officialBalance = hasRealApiKey ? await fetchOfficialBalance(token) : null;
      return {
        fetchedAt,
        accumulatedCost: live.accumulatedCost,
        tokensUsed: live.tokensUsed,
        requestCount: live.requestCount,
        balance: officialBalance?.balance ?? live.balance,
        grantedBalance: officialBalance?.grantedBalance,
        toppedUpBalance: officialBalance?.toppedUpBalance ?? live.toppedUpBalance,
        currency: officialBalance?.currency ?? live.currency ?? 'USD',
        planType: 'DeepSeek Platform',
        tier: 'Pay-as-you-go',
      };
    }

    if (cached) {
      return {
        ...cached,
        fetchedAt,
        error: 'Tu sesión web de DeepSeek parece haber caducado. Mostrando el último dato guardado — pulsa "Iniciar sesión web" para reconectar.',
      };
    }
  }

  if (hasRealApiKey) {
    const officialBalance = await fetchOfficialBalance(token);
    if (officialBalance) {
      return {
        fetchedAt,
        ...officialBalance,
        unavailable: ['accumulatedCost', 'tokensUsed', 'requestCount'],
      };
    }
  }

  if (cached) {
    return { ...cached, fetchedAt };
  }

  throw new Error('No se pudo obtener el saldo de DeepSeek. Verifica tu API key o vuelve a iniciar sesión web.');
}
