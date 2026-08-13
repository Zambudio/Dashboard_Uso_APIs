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

function removeLegacyEnvKeys(envFilePath, fsImpl = fs) {
  if (!fsImpl.existsSync(envFilePath)) return;
  const raw = fsImpl.readFileSync(envFilePath, 'utf8');
  const next = raw
    .split(/\r?\n/)
    .filter((line) => !new RegExp(`^\\s*${KEYS_VAR}\\s*=`).test(line))
    .join('\n');
  if (next !== raw) fsImpl.writeFileSync(envFilePath, next, 'utf8');
}

// safeStorage se inyecta (no se importa 'electron' aquí) para que este
// módulo se pueda probar con `node --test` sin que Electron esté corriendo.
function createCredentialStore({ safeStorage, filePath, fsImpl = fs }) {
  function load() {
    if (!fsImpl.existsSync(filePath)) return {};
    const raw = fsImpl.readFileSync(filePath);
    if (raw.length === 0) return {};
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('El cifrado seguro del sistema operativo no está disponible; no se leerán credenciales.');
    }
    const parsed = JSON.parse(safeStorage.decryptString(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('El almacén cifrado de credenciales tiene un formato inválido.');
    }
    return parsed;
  }

  function save(keys) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('El cifrado seguro del sistema operativo no está disponible; no se guardarán credenciales en texto plano.');
    }
    const json = JSON.stringify(keys);
    const dir = path.dirname(filePath);
    if (!fsImpl.existsSync(dir)) fsImpl.mkdirSync(dir, { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    fsImpl.writeFileSync(temporaryPath, safeStorage.encryptString(json));
    fsImpl.renameSync(temporaryPath, filePath);
  }

  return { load, save };
}

module.exports = { createCredentialStore, migrateFromLegacyEnv, parseLegacyEnvKeys, removeLegacyEnvKeys };
