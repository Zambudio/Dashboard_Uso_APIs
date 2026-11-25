'use strict';

// Autenticación del servidor HTTP cuando se expone fuera de localhost
// (despliegue Docker en el NAS). Módulo puro consumido por `proxy.ts`; se
// mantiene en JS plano para probarlo con `node --test`.
//
// - Sin DASHBOARD_AUTH_TOKEN y sin DASHBOARD_REQUIRE_AUTH: autenticación
//   desactivada (widget Electron en 127.0.0.1 y `npm run dev`).
// - DASHBOARD_REQUIRE_AUTH=1 (fijado en el Dockerfile): el token es
//   obligatorio; si falta o es demasiado corto se responde 503 (fallo seguro).
// - Navegador: HTTP Basic con usuario DASHBOARD_AUTH_USER (por defecto
//   `admin`) y contraseña = token. Clientes de sincronización: cabecera
//   `Authorization: Bearer <token>`.

const crypto = require('node:crypto');

const MIN_TOKEN_LENGTH = 32;
const DEFAULT_USER = 'admin';
const REALM = 'Dashboard Uso APIs';
const SYNC_PATH = '/api/usage/sync';

function isTruthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'si', 'sí'].includes(value.trim().toLowerCase());
}

function resolveAuthConfig(env) {
  const token = typeof env.DASHBOARD_AUTH_TOKEN === 'string' ? env.DASHBOARD_AUTH_TOKEN.trim() : '';
  const required = isTruthy(env.DASHBOARD_REQUIRE_AUTH);
  const user = (typeof env.DASHBOARD_AUTH_USER === 'string' && env.DASHBOARD_AUTH_USER.trim()) || DEFAULT_USER;

  if (!token) {
    if (!required) return { mode: 'disabled' };
    return {
      mode: 'misconfigured',
      reason:
        'Este despliegue exige autenticación y falta DASHBOARD_AUTH_TOKEN. Defínelo en el .env junto a ' +
        'docker-compose.yml (por ejemplo con `openssl rand -hex 32`) y recrea el contenedor.',
    };
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    return {
      mode: 'misconfigured',
      reason: `DASHBOARD_AUTH_TOKEN debe tener al menos ${MIN_TOKEN_LENGTH} caracteres. Genera uno con \`openssl rand -hex 32\` y recrea el contenedor.`,
    };
  }
  return { mode: 'enabled', user, token };
}

// Comparación en tiempo constante independiente de la longitud: se comparan
// los resúmenes SHA-256 de ambos valores.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isAuthorized(authorization, config) {
  if (typeof authorization !== 'string') return false;
  const match = /^(\w+)\s+(.+)$/.exec(authorization.trim());
  if (!match) return false;
  const scheme = match[1].toLowerCase();
  const value = match[2].trim();

  if (scheme === 'bearer') return safeEqual(value, config.token);

  if (scheme === 'basic') {
    if (!/^[A-Za-z0-9+/]+=*$/.test(value)) return false;
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return false;
    const userOk = safeEqual(decoded.slice(0, sep), config.user);
    const passOk = safeEqual(decoded.slice(sep + 1), config.token);
    return userOk && passOk;
  }
  return false;
}

function isPublicRequest(method, pathname) {
  if (pathname === '/api/health') return method === 'GET' || method === 'HEAD';
  // El preflight CORS nunca lleva credenciales.
  if (pathname === SYNC_PATH) return method === 'OPTIONS';
  // Código estático del bookmarklet (sin secretos); el envío posterior a
  // /api/usage/sync sí exige el token.
  if (pathname === '/bookmarklet.js') return method === 'GET' || method === 'HEAD';
  return false;
}

function deny(status, error, pathname, extraHeaders) {
  const headers = { 'Cache-Control': 'no-store', ...extraHeaders };
  if (pathname === SYNC_PATH) headers['Access-Control-Allow-Origin'] = '*';
  return { allow: false, status, body: { error }, headers };
}

/**
 * @typedef {{ allow: true } | { allow: false, status: number, body: { error: string }, headers: Record<string, string> }} AuthDecision
 * @param {{ method: string, pathname: string, authorization: string | null }} request
 * @param {{ mode: string, user?: string, token?: string, reason?: string }} config
 * @returns {AuthDecision}
 */
function evaluateRequest({ method, pathname, authorization }, config) {
  if (config.mode === 'disabled') return { allow: true };
  if (isPublicRequest(String(method).toUpperCase(), pathname)) return { allow: true };
  if (config.mode === 'misconfigured') return deny(503, config.reason, pathname);
  if (isAuthorized(authorization, config)) return { allow: true };
  return deny(
    401,
    'Autenticación requerida. En el navegador usa el usuario configurado y DASHBOARD_AUTH_TOKEN como contraseña; ' +
      'los clientes de sincronización deben enviar `Authorization: Bearer <DASHBOARD_AUTH_TOKEN>`.',
    pathname,
    { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` }
  );
}

module.exports = { MIN_TOKEN_LENGTH, resolveAuthConfig, evaluateRequest };
