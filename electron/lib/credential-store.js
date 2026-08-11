'use strict';

const fs = require('fs');
const path = require('path');

const KEYS_VAR = 'DASHBOARD_PROVIDER_KEYS';

// Parsea la misma línea base64-JSON de .env que lib/env-keys.server.ts, para
// poder importar un .env anterior a Electron una sola vez al almacén cifrado.
function parseLegacyEnvKeys(envFileContents) {
  const regex = new RegExp(`^\\s*${KEYS_VAR}\\s*=\\s*"?([^"\\r\\n]*)"?\\s*$`);
  for (const line of envFileContents.split(/\r?\n/)) {
    const match = line.match(regex);
    if (!match || !match[1]) continue;
    try {
      return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function migrateFromLegacyEnv(envFilePath, fsImpl = fs) {
  if (!fsImpl.existsSync(envFilePath)) return null;
  const raw = fsImpl.readFileSync(envFilePath, 'utf8');
  return parseLegacyEnvKeys(raw);
}

// safeStorage se inyecta (no se importa 'electron' aquí) para que este
// módulo se pueda probar con `node --test` sin que Electron esté corriendo.
function createCredentialStore({ safeStorage, filePath, fsImpl = fs }) {
  function load() {
    if (!fsImpl.existsSync(filePath)) return {};
    const raw = fsImpl.readFileSync(filePath);
    if (raw.length === 0) return {};
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return JSON.parse(safeStorage.decryptString(raw));
      }
      return JSON.parse(raw.toString('utf8'));
    } catch {
      return {};
    }
  }

  function save(keys) {
    const json = JSON.stringify(keys);
    const dir = path.dirname(filePath);
    if (!fsImpl.existsSync(dir)) fsImpl.mkdirSync(dir, { recursive: true });
    if (safeStorage.isEncryptionAvailable()) {
      fsImpl.writeFileSync(filePath, safeStorage.encryptString(json));
    } else {
      fsImpl.writeFileSync(filePath, json, 'utf8');
    }
  }

  return { load, save };
}

module.exports = { createCredentialStore, migrateFromLegacyEnv, parseLegacyEnvKeys };
