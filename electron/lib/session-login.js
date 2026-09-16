'use strict';

// session-login.js
//
// Login interactivo vía una ventana BrowserWindow del proceso principal de
// Electron, con captura automática de la cookie de sesión.
//
// Por qué ventana Electron y no Playwright:
//  - Playwright lanza Chromium con automatización detectable (flags/CDP) y
//    Google/Cloudflare lo bloquean ("Este navegador o aplicación no es seguro").
//  - Una BrowserWindow de Electron es un Chromium real donde el usuario se
//    autentica normalmente; al terminar, la cookie cae en session.defaultSession
//    y la capturamos con el evento `cookies.on('changed')`. Después se reutiliza
//    la misma sesión con fetch-via-window para consultar el uso sin anti-bot.
//
// Seguridad:
//  - La navegación se restringe a una lista de dominios de confianza.
//  - Las ventanas emergentes se bloquean y se muestra la URL actual en el título.

const { BrowserWindow, session } = require('electron');

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isTrustedHost(hostname, trustedHosts) {
  return trustedHosts.some((domain) => hostname === domain || hostname.endsWith('.' + domain));
}

/**
 * Fija el user-agent de Chrome en la sesión por defecto (se llama una vez en
 * `ready`). Evita que Electron se detecte como tal en las peticiones. Además
 * se reescriben las cabeceras Client Hints (sec-ch-ua) para que el servidor de
 * login no distinga Electron/Chromium de Chrome real — esto es lo que evita el
 * "navegador o aplicación no seguros" / "Hubo un error al iniciar sesión".
 */
function setSessionChromeUserAgent() {
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.url.startsWith('https://') || details.url.startsWith('http://')) {
      details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
      details.requestHeaders['sec-ch-ua'] = '"Chromium";v="120", "Not.A/Brand";v="8", "Google Chrome";v="120"';
      details.requestHeaders['sec-ch-ua-mobile'] = '?0';
      details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

/**
 * Abre una ventana de login y resuelve con el valor de la cookie pedida cuando
 * el usuario termina de autenticarse.
 *
 * @param {object} args
 * @param {string} args.url           URL inicial (login del proveedor).
 * @param {string} args.cookieName    Nombre de la cookie a capturar.
 * @param {string[]} args.trustedHosts Dominios de confianza (login + OAuth).
 * @param {number} [args.timeoutMs]   Timeout (default 120000).
 * @returns {Promise<{success:boolean, cookie?:string, error?:string}>}
 */
function captureSessionCookie({ url, cookieName, trustedHosts, timeoutMs = 120000 }) {
  return new Promise((resolve) => {
    // Limpia una cookie previa para forzar una captura fresca.
    try {
      session.defaultSession.cookies.remove(url, cookieName);
    } catch {
      /* ignore */
    }

    const loginWin = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Iniciar sesión - ' + url,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    let resolved = false;
    const domainMatch = (cookie) => cookie.name === cookieName && cookie.value;

    loginWin.webContents.on('will-navigate', (event, nextUrl) => {
      try {
        const hostname = new URL(nextUrl).hostname;
        if (!isTrustedHost(hostname, trustedHosts)) {
          event.preventDefault();
          console.warn('[session-login] Bloqueada navegación no confiable:', nextUrl);
        } else {
          loginWin.setTitle(`Iniciar sesión - ${nextUrl}`);
        }
      } catch (err) {
        event.preventDefault();
        console.warn('[session-login] Bloqueada URL inválida:', nextUrl);
      }
    });

    const showUrl = (event, currentUrl) => {
      try {
        const hostname = new URL(currentUrl).hostname;
        if (isTrustedHost(hostname, trustedHosts)) {
          loginWin.setTitle(`Iniciar sesión - ${currentUrl}`);
        }
      } catch {
        /* ignore */
      }
    };
    loginWin.webContents.on('did-navigate', showUrl);
    loginWin.webContents.on('did-navigate-in-page', showUrl);

    loginWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const onCookieChanged = (event, cookie) => {
      if (domainMatch(cookie) && !resolved) {
        resolved = true;
        session.defaultSession.cookies.removeListener('changed', onCookieChanged);
        loginWin.close();
        resolve({ success: true, cookie: cookie.value });
      }
    };
    session.defaultSession.cookies.on('changed', onCookieChanged);

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      loginWin.close();
      resolve({ success: false, error: `La sesión no se completó en ${Math.round(timeoutMs / 1000)} segundos.` });
    }, timeoutMs);

    loginWin.on('closed', () => {
      session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: 'La ventana de inicio de sesión se cerró antes de completarse.' });
      }
    });

    loginWin.loadURL(url);
  });
}

module.exports = {
  captureSessionCookie,
  setSessionChromeUserAgent,
  setCookies,
  isTrustedHost,
  CHROME_USER_AGENT,
};

/**
 * Establece una lista de cookies en la sesión por defecto de Electron para que
 * las llamadas reutilicen una sesión ya autenticada (p. ej. tras reiniciar la
 * app, el servidor guarda la cookie cifrada y la reintroduce aquí).
 *
 * @param {Array<{url:string;name:string;value:string;domain?:string}>} cookies
 */
async function setCookies(cookies) {
  for (const cookie of cookies) {
    if (!cookie || !cookie.url || !cookie.name || typeof cookie.value !== 'string') continue;
    try {
      await session.defaultSession.cookies.set({
        url: cookie.url,
        name: cookie.name,
        value: cookie.value,
        ...(cookie.domain ? { domain: cookie.domain } : {}),
        path: cookie.path || '/',
        ...(cookie.secure !== undefined ? { secure: cookie.secure } : {}),
        ...(cookie.httpOnly !== undefined ? { httpOnly: cookie.httpOnly } : {}),
      });
    } catch (err) {
      console.warn('[session-login] No se pudo fijar la cookie', cookie.name, ':', err.message);
    }
  }
}
