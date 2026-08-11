'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveBrokerConfig, readKeysFromBroker, writeKeysToBroker } = require('./cred-broker-client');

test('resolveBrokerConfig returns null when neither env var is set (dev mode sin Electron)', () => {
  assert.equal(resolveBrokerConfig({}), null);
});

test('resolveBrokerConfig returns null when only one of the two env vars is set', () => {
  assert.equal(resolveBrokerConfig({ DASHBOARD_CRED_BROKER_URL: 'http://127.0.0.1:1234' }), null);
});

test('resolveBrokerConfig returns the broker config when both env vars are set', () => {
  const broker = resolveBrokerConfig({
    DASHBOARD_CRED_BROKER_URL: 'http://127.0.0.1:1234',
    DASHBOARD_CRED_BROKER_TOKEN: 'abc',
  });
  assert.deepEqual(broker, { url: 'http://127.0.0.1:1234', token: 'abc' });
});

test('readKeysFromBroker sends the bearer token and returns the parsed JSON body', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ openai: 'sk-1' }) };
  };
  const result = await readKeysFromBroker({ url: 'http://127.0.0.1:1234', token: 'tok' }, fakeFetch);
  assert.deepEqual(result, { openai: 'sk-1' });
  assert.equal(calls[0].url, 'http://127.0.0.1:1234/credentials');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
});

test('readKeysFromBroker throws when the broker responds with a non-2xx status', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(() => readKeysFromBroker({ url: 'http://x', token: 't' }, fakeFetch));
});

test('writeKeysToBroker PUTs the JSON body with the bearer token', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true };
  };
  await writeKeysToBroker({ url: 'http://127.0.0.1:1234', token: 'tok' }, { openai: 'sk-1' }, fakeFetch);
  assert.equal(calls[0].opts.method, 'PUT');
  assert.equal(JSON.parse(calls[0].opts.body).openai, 'sk-1');
});
