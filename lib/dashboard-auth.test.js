'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthConfig, evaluateRequest, MIN_TOKEN_LENGTH } = require('./dashboard-auth');

const TOKEN = 'a'.repeat(MIN_TOKEN_LENGTH);
const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');

test('resolveAuthConfig disables auth when no token and auth is not required (Electron / npm run dev)', () => {
  assert.deepEqual(resolveAuthConfig({}), { mode: 'disabled' });
});

test('resolveAuthConfig is misconfigured when auth is required but the token is missing', () => {
  const config = resolveAuthConfig({ DASHBOARD_REQUIRE_AUTH: '1' });
  assert.equal(config.mode, 'misconfigured');
  assert.match(config.reason, /DASHBOARD_AUTH_TOKEN/);
});

test('resolveAuthConfig rejects tokens shorter than the minimum length', () => {
  const config = resolveAuthConfig({ DASHBOARD_AUTH_TOKEN: 'corto' });
  assert.equal(config.mode, 'misconfigured');
  assert.match(config.reason, new RegExp(String(MIN_TOKEN_LENGTH)));
});

test('resolveAuthConfig enables auth with the default user when a valid token is present', () => {
  const config = resolveAuthConfig({ DASHBOARD_AUTH_TOKEN: `  ${TOKEN}  ` });
  assert.deepEqual(config, { mode: 'enabled', user: 'admin', token: TOKEN });
});

test('resolveAuthConfig honours DASHBOARD_AUTH_USER', () => {
  const config = resolveAuthConfig({
    DASHBOARD_AUTH_TOKEN: TOKEN,
    DASHBOARD_AUTH_USER: 'pedro',
    DASHBOARD_REQUIRE_AUTH: 'true',
  });
  assert.equal(config.mode, 'enabled');
  assert.equal(config.user, 'pedro');
});

test('evaluateRequest allows everything when auth is disabled', () => {
  const decision = evaluateRequest({ method: 'GET', pathname: '/api/keys', authorization: null }, { mode: 'disabled' });
  assert.equal(decision.allow, true);
});

test('evaluateRequest answers 503 on every protected route when misconfigured (fail closed)', () => {
  const config = resolveAuthConfig({ DASHBOARD_REQUIRE_AUTH: '1' });
  const decision = evaluateRequest({ method: 'GET', pathname: '/', authorization: basic('admin', 'x') }, config);
  assert.equal(decision.allow, false);
  assert.equal(decision.status, 503);
  assert.match(decision.body.error, /DASHBOARD_AUTH_TOKEN/);
});

test('evaluateRequest keeps the health check public even when misconfigured', () => {
  const config = resolveAuthConfig({ DASHBOARD_REQUIRE_AUTH: '1' });
  assert.equal(evaluateRequest({ method: 'GET', pathname: '/api/health', authorization: null }, config).allow, true);
});

test('evaluateRequest asks for Basic credentials when none are sent', () => {
  const config = resolveAuthConfig({ DASHBOARD_AUTH_TOKEN: TOKEN });
  const decision = evaluateRequest({ method: 'GET', pathname: '/', authorization: null }, config);
  assert.equal(decision.allow, false);
  assert.equal(decision.status, 401);
  assert.match(decision.headers['WWW-Authenticate'], /^Basic realm=/);
});

test('evaluateRequest accepts valid Basic credentials and rejects wrong user or password', () => {
  const config = resolveAuthConfig({ DASHBOARD_AUTH_TOKEN: TOKEN });
  const req = (authorization) => ({ method: 'GET', pathname: '/api/usage', authorization });
  assert.equal(evaluateRequest(req(basic('admin', TOKEN)), config).allow, true);
  assert.equal(evaluateRequest(req(basic('otro', TOKEN)), config).allow, false);
  assert.equal(evaluateRequest(req(basic('admin', TOKEN + 'x')), config).allow, false);
  assert.equal(evaluateRequest(req('Basic !!!no-base64'), config).allow, false);
});

test('evaluateRequest accepts a Bearer token for sync clients', () => {
  const config = resolveAuthConfig({ DASHBOARD_AUTH_TOKEN: TOKEN });
  const req = (authorization) => ({ method: 'POST', pathname: '/api/usage/sync', authorization });
  assert.equal(evaluateRequest(req(`Bearer ${TOKEN}`), config).allow, true);
  const denied = evaluateRequest(req('Bearer incorrecto'), config);
  assert.equal(denied.allow, false);
  assert.equal(denied.status, 401);
  assert.equal(denied.headers['Access-Control-Allow-Origin'], '*');
});

test('evaluateRequest lets CORS preflight and the public bookmarklet script through', () => {
  const config = resolveAuthConfig({ DASHBOARD_AUTH_TOKEN: TOKEN });
  assert.equal(
    evaluateRequest({ method: 'OPTIONS', pathname: '/api/usage/sync', authorization: null }, config).allow,
    true
  );
  assert.equal(
    evaluateRequest({ method: 'GET', pathname: '/bookmarklet.js', authorization: null }, config).allow,
    true
  );
  assert.equal(evaluateRequest({ method: 'OPTIONS', pathname: '/api/keys', authorization: null }, config).allow, false);
  assert.equal(evaluateRequest({ method: 'POST', pathname: '/api/health', authorization: null }, config).allow, false);
});
