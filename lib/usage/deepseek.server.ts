import { ApiUsageSnapshot } from '@/types/api';
import { launchDeepSeekChromium, scrapeDeepSeekUsage } from './deepseek-scrape.server';
import { readEnvKeys, writeEnvKeys } from '@/lib/env-keys.server';

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

interface LiveScrapeResult {
  usage: Partial<ApiUsageSnapshot>;
  cookies: StoredCookie[];
  localStorage: Record<string, string>;
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

/** Vuelca todo localStorage del origen actual, igual que hace el login inicial en browser-login.server.ts. */
async function dumpLocalStorage(page: import('playwright').Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const dump: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      const v = localStorage.getItem(k) || '';
      if (k && v.length < 20000) dump[k] = v;
    }
    return dump;
  });
}

/**
 * Vuelve a abrir la página de uso de DeepSeek con la sesión guardada para leer
 * coste, tokens y peticiones en vivo. DeepSeek no expone estos datos en ninguna
 * API pública, así que el navegador headless es la única fuente.
 *
 * DeepSeek autentica su SPA con un token en localStorage (típico de un login por
 * popup de Google OAuth), no con una cookie de sesión propia — por eso hay que
 * restaurar localStorage además de las cookies, o la sesión no se reconoce.
 *
 * Además de los datos de uso, devuelve las cookies/localStorage tal como quedan
 * tras la navegación: la plataforma va detrás de AWS WAF, que rota tokens
 * (ej. `aws-waf-token`) en cada visita. Si nunca actualizamos lo que guardamos,
 * cada replay futuro usa credenciales cada vez más viejas aunque la sesión real
 * siga activa — `fetchDeepSeekUsage` se encarga de persistir este resultado.
 */
async function scrapeLiveDeepSeekUsage(
  cookies: StoredCookie[],
  localStorageData: Record<string, string>
): Promise<LiveScrapeResult | null> {
  if (!cookies.length && Object.keys(localStorageData).length === 0) return null;

  const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const browser = await launchDeepSeekChromium();
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: null,
    });
    if (cookies.length) await addCookiesSafely(context, cookies);

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
      } catch {}
    });

    const page = await context.newPage();

    if (Object.keys(localStorageData).length) {
      await context.addInitScript((data) => {
        if (window.location.hostname.includes('deepseek.com')) {
          for (const [key, value] of Object.entries(data)) {
            try {
              localStorage.setItem(key, value);
            } catch {}
          }
        }
      }, localStorageData);
    }

    // Timeouts generosos: dentro del widget este scraping compite por CPU con
    // el proceso de Electron (UI del widget, sondeos de otros proveedores),
    // a diferencia de una ejecución aislada — un timeout corto puede leerse
    // como "sesión caducada" cuando en realidad solo iba lento.
    await page.goto('https://platform.deepseek.com/usage', { waitUntil: 'domcontentloaded', timeout: 20000 });

    const currentUrl = page.url();
    if (currentUrl.includes('sign_in') || currentUrl.includes('login')) {
      // La cookie ya no es válida: nos redirigió a la pantalla de login.
      console.warn('[deepseek-scrape] redirigido a login/sign_in, sesión inválida. URL final:', currentUrl);
      return null;
    }

    // SPA: esperamos a que los datos de uso terminen de pintarse en vez de
    // depender de "networkidle" (DeepSeek mantiene peticiones de fondo que
    // nunca dejan la red inactiva y harían expirar el timeout).
    //
    // OJO: no basta con esperar a que aparezca la ETIQUETA "Topped-up
    // balance" — esa etiqueta forma parte del esqueleto estático de la
    // página y aparece casi al instante, antes de que el importe real
    // termine de cargar (mientras tanto se ve "Profile" en vez del nombre
    // real de usuario). Esperar solo la etiqueta hacía que domInfo.* saliera
    // siempre undefined y la sesión se reportara como caducada aunque
    // siguiera siendo válida. Se exige además un símbolo de moneda cerca de
    // la etiqueta, que solo aparece cuando el importe ya se pintó.
    await page
      .waitForFunction(
        () => {
          const text = document.body.innerText || '';
          const idx = text.indexOf('Topped-up balance');
          if (idx === -1) return false;
          return /[$¥€]/.test(text.slice(idx, idx + 200));
        },
        { timeout: 20000 }
      )
      .catch(() => {});

    const scraped = await scrapeDeepSeekUsage(page);
    if (
      scraped.cost === undefined &&
      scraped.tokens === undefined &&
      scraped.requests === undefined &&
      scraped.toppedUpBalance === undefined
    ) {
      const debugText = await page.evaluate(() => (document.body.innerText || '').slice(0, 300)).catch(() => '(no se pudo leer el texto)');
      console.warn(
        '[deepseek-scrape] la página cargó pero no se encontraron datos de uso reconocibles (posible bloqueo/CAPTCHA de AWS WAF o cambio de interfaz). URL final:',
        currentUrl,
        '\n[deepseek-scrape] primeros 300 caracteres de la página:\n' + debugText
      );
      return null;
    }

    const allCookiesAfter = await context.cookies();
    const refreshedCookies = allCookiesAfter.filter((c) => c.domain.includes('deepseek.com'));
    const refreshedLocalStorage = await dumpLocalStorage(page);

    return {
      usage: {
        accumulatedCost: scraped.cost,
        tokensUsed: scraped.tokens,
        requestCount: scraped.requests,
        balance: scraped.toppedUpBalance,
        toppedUpBalance: scraped.toppedUpBalance,
        currency: scraped.currency,
      },
      cookies: refreshedCookies.length ? refreshedCookies : cookies,
      localStorage: Object.keys(refreshedLocalStorage).length ? refreshedLocalStorage : localStorageData,
    };
  } catch (err) {
    // Fallo inesperado del navegador (timeout, navegación, etc.): tratamos como "sin datos en vivo".
    console.warn('[deepseek-scrape] excepción durante el scraping:', err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * Reintenta una vez más antes de rendirse: un fallo aislado (timeout puntual,
 * red lenta) no debería mostrarse como "sesión caducada" si el segundo intento
 * sí funciona. No reintenta la comprobación inicial de "no hay sesión guardada".
 */
async function scrapeLiveDeepSeekUsageWithRetry(
  cookies: StoredCookie[],
  localStorageData: Record<string, string>
): Promise<LiveScrapeResult | null> {
  const attempts = 2;
  let result: LiveScrapeResult | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = await scrapeLiveDeepSeekUsage(cookies, localStorageData);
    if (result) return result;
    if (attempt < attempts) {
      console.warn(`[deepseek-scrape] intento ${attempt} sin datos, reintentando...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return result;
}

/** Persiste cookies/localStorage refrescados tras un scrape en vivo con éxito, para que el próximo replay use la sesión más fresca posible en vez de la capturada en el login original. */
async function persistRefreshedSession(
  providerId: string,
  apiKey: string,
  cookies: StoredCookie[],
  localStorageData: Record<string, string>,
  snapshot: ApiUsageSnapshot
): Promise<void> {
  try {
    const keys = await readEnvKeys();
    const payload: DeepSeekStoredSecret = {
      apiKey,
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      cookies,
      localStorage: localStorageData,
      cachedSnapshot: snapshot,
    };
    keys[providerId] = JSON.stringify(payload);
    await writeEnvKeys(keys);
  } catch (err) {
    console.warn('[deepseek-scrape] no se pudo refrescar la sesión guardada:', err instanceof Error ? err.message : String(err));
  }
}

export async function fetchDeepSeekUsage(secret: string, providerId?: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();
  let token = secret.trim();
  let cookies: StoredCookie[] = [];
  let localStorageData: Record<string, string> = {};
  let cached: ApiUsageSnapshot | undefined;
  let storedApiKey = '';

  if (token.startsWith('{')) {
    try {
      const parsed = JSON.parse(token) as DeepSeekStoredSecret;
      cached = parsed.cachedSnapshot;
      cookies = parsed.cookies?.length ? parsed.cookies : parsed.cookie ? cookiesFromFlatString(parsed.cookie) : [];
      localStorageData = parsed.localStorage ?? {};
      storedApiKey = parsed.apiKey ?? '';
      token = storedApiKey;
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
    const live = await scrapeLiveDeepSeekUsageWithRetry(cookies, localStorageData);
    if (live) {
      const officialBalance = hasRealApiKey ? await fetchOfficialBalance(token) : null;
      const snapshot: ApiUsageSnapshot = {
        fetchedAt,
        accumulatedCost: live.usage.accumulatedCost,
        tokensUsed: live.usage.tokensUsed,
        requestCount: live.usage.requestCount,
        balance: officialBalance?.balance ?? live.usage.balance,
        grantedBalance: officialBalance?.grantedBalance,
        toppedUpBalance: officialBalance?.toppedUpBalance ?? live.usage.toppedUpBalance,
        currency: officialBalance?.currency ?? live.usage.currency ?? 'USD',
        planType: 'DeepSeek Platform',
        tier: 'Pay-as-you-go',
      };

      if (providerId) {
        await persistRefreshedSession(providerId, storedApiKey, live.cookies, live.localStorage, snapshot);
      }

      return snapshot;
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
