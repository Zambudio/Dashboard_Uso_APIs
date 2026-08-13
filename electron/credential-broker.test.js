'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startCredentialBroker } = require('./credential-broker');

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s, 'utf8'),
    decryptString: (buf) => buf.toString('utf8'),
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'broker-'));
}

function fakeConfigStore() {
  const values = new Map();
  return {
    get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
  };
}

function request(url, { method = 'GET', token, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('GET /credentials without a token is rejected with 401', async () => {
  const broker = await startCredentialBroker({ safeStorage: fakeSafeStorage(), filePath: path.join(tmpDir(), 'c.enc') });
  const res = await request(`${broker.url}/credentials`);
  assert.equal(res.status, 401);
  await broker.close();
});

test('PUT then GET /credentials round-trips with the correct token', async () => {
  const broker = await startCredentialBroker({ safeStorage: fakeSafeStorage(), filePath: path.join(tmpDir(), 'c.enc') });
  const put = await request(`${broker.url}/credentials`, { method: 'PUT', token: broker.token, body: { openai: 'sk-1' } });
  assert.equal(put.status, 200);
  const get = await request(`${broker.url}/credentials`, { token: broker.token });
  assert.deepEqual(JSON.parse(get.body), { openai: 'sk-1' });
  await broker.close();
});

test('imports a legacy .env DASHBOARD_PROVIDER_KEYS once when the encrypted store is empty', async () => {
  const dir = tmpDir();
  const envPath = path.join(dir, '.env');
  const encoded = Buffer.from(JSON.stringify({ deepseek: 'sess-legacy' })).toString('base64');
  fs.writeFileSync(envPath, `DASHBOARD_PROVIDER_KEYS=${encoded}\n`);
  const broker = await startCredentialBroker({ safeStorage: fakeSafeStorage(), filePath: path.join(dir, 'c.enc'), legacyEnvPath: envPath });
  const get = await request(`${broker.url}/credentials`, { token: broker.token });
  assert.deepEqual(JSON.parse(get.body), { deepseek: 'sess-legacy' });
  assert.doesNotMatch(fs.readFileSync(envPath, 'utf8'), /DASHBOARD_PROVIDER_KEYS/);
  await broker.close();
});

test('unknown path returns 404', async () => {
  const broker = await startCredentialBroker({ safeStorage: fakeSafeStorage(), filePath: path.join(tmpDir(), 'c.enc') });
  const res = await request(`${broker.url}/other`, { token: broker.token });
  assert.equal(res.status, 404);
  await broker.close();
});

test('PUT then GET /config persists non-sensitive dashboard state', async () => {
  const broker = await startCredentialBroker({
    safeStorage: fakeSafeStorage(),
    filePath: path.join(tmpDir(), 'c.enc'),
    configStore: fakeConfigStore(),
  });
  const value = { preferences: { widgetOpacity: 85 } };
  const put = await request(`${broker.url}/config`, { method: 'PUT', token: broker.token, body: value });
  assert.equal(put.status, 200);
  const get = await request(`${broker.url}/config`, { token: broker.token });
  assert.deepEqual(JSON.parse(get.body), { providers: null, preferences: { widgetOpacity: 85 } });
  await broker.close();
});

test('rejects invalid credential payloads at the broker boundary', async () => {
  const broker = await startCredentialBroker({ safeStorage: fakeSafeStorage(), filePath: path.join(tmpDir(), 'c.enc') });
  const put = await request(`${broker.url}/credentials`, { method: 'PUT', token: broker.token, body: { '../bad': 'secret' } });
  assert.equal(put.status, 400);
  await broker.close();
});
