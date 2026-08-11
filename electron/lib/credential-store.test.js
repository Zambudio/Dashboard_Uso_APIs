'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCredentialStore, migrateFromLegacyEnv } = require('./credential-store');

function fakeSafeStorage(available) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from('ENC:' + s, 'utf8'),
    decryptString: (buf) => buf.toString('utf8').replace(/^ENC:/, ''),
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cred-store-'));
}

test('load() returns {} when the store file does not exist yet', () => {
  const dir = tmpDir();
  const store = createCredentialStore({ safeStorage: fakeSafeStorage(true), filePath: path.join(dir, 'credentials.enc') });
  assert.deepEqual(store.load(), {});
});

test('save() then load() round-trips through safeStorage when encryption is available', () => {
  const dir = tmpDir();
  const filePath = path.join(dir, 'credentials.enc');
  const store = createCredentialStore({ safeStorage: fakeSafeStorage(true), filePath });
  store.save({ openai: 'sk-test-123' });
  assert.deepEqual(store.load(), { openai: 'sk-test-123' });
  const onDisk = fs.readFileSync(filePath, 'utf8');
  assert.ok(onDisk.startsWith('ENC:'), 'expected the file on disk to have gone through "encryption"');
});

test('falls back to plain JSON when safeStorage.isEncryptionAvailable() is false', () => {
  const dir = tmpDir();
  const filePath = path.join(dir, 'credentials.enc');
  const store = createCredentialStore({ safeStorage: fakeSafeStorage(false), filePath });
  store.save({ deepseek: 'sess-abc' });
  const onDisk = fs.readFileSync(filePath, 'utf8');
  assert.deepEqual(JSON.parse(onDisk), { deepseek: 'sess-abc' });
});

test('migrateFromLegacyEnv() decodes the base64 DASHBOARD_PROVIDER_KEYS line', () => {
  const dir = tmpDir();
  const envPath = path.join(dir, '.env');
  const encoded = Buffer.from(JSON.stringify({ anthropic: 'sk-ant-legacy' })).toString('base64');
  fs.writeFileSync(envPath, `DASHBOARD_PROVIDER_KEYS=${encoded}\n`);
  assert.deepEqual(migrateFromLegacyEnv(envPath), { anthropic: 'sk-ant-legacy' });
});

test('migrateFromLegacyEnv() returns null when there is no .env file', () => {
  const dir = tmpDir();
  assert.equal(migrateFromLegacyEnv(path.join(dir, '.env')), null);
});
