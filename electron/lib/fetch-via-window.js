'use strict';

// fetch-via-window.js
//
// Obtención de JSON desde una URL usando una BrowserWindow oculta de Electron.
//
// Muchos proveedores (Claude.ai/Cloudflare, OpenAI, Google) detectan y bloquean
// las peticiones Node/Playwright por cabeceras o automatización. Cargando la URL
// en una ventana oculta con el user-agent de Chrome y las cookies de la sesión de
// Electron (session.defaultSession) se viaja como un Chromium real autenticado y
// no se dispara la protección anti-bot. Es el mismo enfoque del widget de
// referencia y evita leer la base de datos de cookies del perfil.

const { BrowserWindow } = require('electron');

const BLOCKED_SIGNATURES = [
  { pattern: 'Just a moment', error: 'CloudflareBlocked' },
  { pattern: 'Enable JavaScript and cookies to continue', error: 'CloudflareChallenge' },
  { pattern: '<html', error: 'UnexpectedHTML' },
];

function parseResponseBody(bodyText) {
  for (const sig of BLOCKED_SIGNATURES) {
    if (bodyText.includes(sig.pattern)) {
      throw new Error(`${sig.error}: ${bodyText.substring(0, 200)}`);
    }
  }
  try {
    return JSON.parse(bodyText);
  } catch (parseErr) {
    throw new Error(`InvalidJSON: ${bodyText.substring(0, 200)}`);
  }
}

function fetchViaWindow(url, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const timeout = setTimeout(() => {
      win.close();
      reject(new Error('Request timeout'));
    }, timeoutMs);

    win.webContents.on('did-finish-load', async () => {
      try {
        const bodyText = await win.webContents.executeJavaScript(
          'document.body.innerText || document.body.textContent'
        );
        clearTimeout(timeout);
        win.close();
        resolve(parseResponseBody(bodyText));
      } catch (err) {
        clearTimeout(timeout);
        win.close();
        reject(err);
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      clearTimeout(timeout);
      win.close();
      reject(new Error(`LoadFailed: ${errorCode} ${errorDescription}`));
    });

    win.loadURL(url);
  });
}

module.exports = { fetchViaWindow, parseResponseBody, BLOCKED_SIGNATURES };
