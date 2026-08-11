# Widget de escritorio con Electron — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el shell WinForms+pkg actual por una app Electron que arranca el mismo servidor Next.js, añade una ventana flotante con las tarjetas de todos los proveedores y un icono de bandeja, y cifra las credenciales con `safeStorage`.

**Architecture:** Electron (proceso principal) spawnea el servidor Next.js standalone como proceso hijo exactamente igual que hoy (sin tocar `lib/usage/*.server.ts` ni el login con Playwright), añade una `BrowserWindow` sin bordes que muestra tarjetas compactas por proveedor (datos empujados por IPC desde el proceso principal, que hace el polling — así se evita CORS entre el renderer `file://` y `http://127.0.0.1:3000`), un icono de bandeja único con color de aviso, y un broker HTTP local en loopback (con token) que envuelve `safeStorage` para que el servidor Next.js —que sigue siendo un proceso Node aparte y no puede llamar a `safeStorage` directamente— lea/escriba las claves cifradas.

**Tech Stack:** Electron + electron-builder + electron-store (persistencia de la ventana), Node.js `http`/`crypto`/`child_process` para el broker y el gestor del servidor, `node --test` (nativo de Node, sin dependencias nuevas) para las pruebas unitarias, HTML/CSS/JS vanilla para el renderer del widget (sin framework, igual que el proyecto de referencia).

## Global Constraints

- No se modifica la lógica de ningún proveedor (`lib/usage/*.server.ts`) ni el flujo de login con Playwright (`lib/browser-login.server.ts`, `app/api/auth/browser-login/route.ts`) más allá de los `await` mecánicos que exige el nuevo broker asíncrono.
- No se modifica el formato de `ApiUsageSnapshot`, `ApiProviderConfig` (solo se añade un campo opcional a `DashboardPreferences`).
- El servidor Next.js debe seguir siendo accesible desde un navegador normal en `http://127.0.0.1:3000` en todo momento ("modo navegador").
- `npm run dev` (sin Electron) debe seguir funcionando exactamente igual que hoy, con `.env` en Base64 como hasta ahora — el broker cifrado es exclusivo de la app Electron empaquetada/`electron:dev`.
- Todo módulo nuevo bajo `electron/` que no dependa de una ventana/bandeja real debe escribirse para ser testeable con `node --test` sin necesidad de que Electron esté corriendo (inyección de dependencias en vez de `require('electron')` dentro de la lógica pura).
- Spec de referencia: `Docs/superpowers/specs/2026-08-11-electron-widget-design.md`.

---

### Task 1: Preferencia `refreshWidgetSeconds`

**Files:**
- Modify: `types/api.ts`
- Modify: `app/page.tsx` (objeto `defaultPreferences`, líneas 21-24)
- Modify: `components/DashboardSettingsPanel.tsx`

**Interfaces:**
- Produces: `DashboardPreferences.refreshWidgetSeconds?: number` — usado más adelante por `electron/usage-poller.js` (Task 8) para decidir cada cuánto refrescar el widget.

- [ ] **Step 1: Añadir el campo al tipo**

En `types/api.ts`, dentro de `DashboardPreferences`:

```ts
export interface DashboardPreferences {
  showHiddenProviders: boolean;
  showSummaryCards: boolean;
  sortOrder: 'default' | 'status' | 'balance' | 'cost';
  /** Orden manual de tarjetas (ids de proveedor) fijado arrastrando. Solo se aplica con sortOrder 'default'. */
  cardOrder?: string[];
  /** Segundos entre refrescos automáticos del widget de escritorio. Por defecto 300 (5 min). */
  refreshWidgetSeconds?: number;
}
```

- [ ] **Step 2: Añadir el valor por defecto**

En `app/page.tsx`, en `defaultPreferences`:

```ts
const defaultPreferences: DashboardPreferences = {
  showHiddenProviders: false,
  showSummaryCards: true,
  sortOrder: 'default',
  refreshWidgetSeconds: 300,
};
```

- [ ] **Step 3: Añadir el control en el panel de ajustes**

En `components/DashboardSettingsPanel.tsx`, dentro del bloque `<div className="mt-5 ...">` que ya contiene el `<select>` de orden de tarjetas, añade justo debajo (antes del cierre de ese `<div>`) un segundo bloque:

```tsx
      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
        <label className="flex items-center justify-between gap-3">
          <span>Refresco del widget de escritorio (segundos)</span>
          <input
            type="number"
            min={30}
            step={30}
            value={preferences.refreshWidgetSeconds ?? 300}
            onChange={(event) => onSave({ ...preferences, refreshWidgetSeconds: Number(event.target.value) || 300 })}
            className="w-24 rounded-xl border border-white/10 bg-[#141424] px-3 py-2 text-white"
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">Cada cuánto consulta el widget flotante los datos de todos los proveedores.</p>
      </div>
```

- [ ] **Step 4: Verificar tipos y build**

Run: `npm run lint && npm run build`
Expected: ambos terminan sin errores.

- [ ] **Step 5: Commit**

```bash
git add types/api.ts app/page.tsx components/DashboardSettingsPanel.tsx
git commit -m "feat: añadir preferencia de intervalo de refresco del widget"
```

---

### Task 2: Cliente puro del broker de credenciales (`lib/cred-broker-client.js`)

**Files:**
- Create: `lib/cred-broker-client.js`
- Test: `lib/cred-broker-client.test.js`

**Interfaces:**
- Produces: `resolveBrokerConfig(env): {url,token} | null`, `readKeysFromBroker(broker, fetchImpl?): Promise<Record<string,string>>`, `writeKeysToBroker(broker, keys, fetchImpl?): Promise<void>` — consumidos por `lib/env-keys.server.ts` en la Task 3.
- Consumes: nada (módulo puro, sin dependencias del proyecto).

Se escribe en JS plano (no `.ts`) para poder ejecutarlo con `node --test` sin un runner de TypeScript — el proyecto no tiene ninguno hoy y añadir uno sería alcance extra no aprobado. `allowJs: true` en `tsconfig.json` permite importarlo con normalidad desde `lib/env-keys.server.ts`.

- [ ] **Step 1: Escribir los tests (deben fallar: el módulo no existe todavía)**

Crea `lib/cred-broker-client.test.js`:

```js
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
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `node --test lib/cred-broker-client.test.js`
Expected: FAIL — `Cannot find module './cred-broker-client'`.

- [ ] **Step 3: Implementar el módulo**

Crea `lib/cred-broker-client.js`:

```js
'use strict';

// Módulo puro consumido por lib/env-keys.server.ts: decide si las claves de
// proveedor deben leerse/escribirse a través del broker de credenciales de
// Electron (widget empaquetado) o del .env heredado (`next dev` sin
// Electron). Se mantiene en JS plano (no .ts) para poder probarlo con
// `node --test` sin depender de un runner de TypeScript.

function resolveBrokerConfig(env) {
  const url = env.DASHBOARD_CRED_BROKER_URL;
  const token = env.DASHBOARD_CRED_BROKER_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function readKeysFromBroker(broker, fetchImpl = fetch) {
  const res = await fetchImpl(`${broker.url}/credentials`, {
    headers: { Authorization: `Bearer ${broker.token}` },
  });
  if (!res.ok) throw new Error(`credential broker GET failed: HTTP ${res.status}`);
  return res.json();
}

async function writeKeysToBroker(broker, keys, fetchImpl = fetch) {
  const res = await fetchImpl(`${broker.url}/credentials`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${broker.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(keys),
  });
  if (!res.ok) throw new Error(`credential broker PUT failed: HTTP ${res.status}`);
}

module.exports = { resolveBrokerConfig, readKeysFromBroker, writeKeysToBroker };
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `node --test lib/cred-broker-client.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cred-broker-client.js lib/cred-broker-client.test.js
git commit -m "feat: añadir cliente puro del broker de credenciales"
```

---

### Task 3: Hacer `lib/env-keys.server.ts` compatible con el broker (async)

**Files:**
- Modify: `lib/env-keys.server.ts`
- Modify: `app/api/keys/route.ts`
- Modify: `app/api/usage/route.ts:31`
- Modify: `lib/browser-login.server.ts` (función `saveSecretForProvider` y sus 4 llamadas: líneas 82-84, 286, 529, 698, 880)
- Modify: `tsconfig.json` (excluir `scratch/`)

**Interfaces:**
- Consumes: `resolveBrokerConfig`, `readKeysFromBroker`, `writeKeysToBroker` de `lib/cred-broker-client.js` (Task 2).
- Produces: `readEnvKeys(): Promise<Record<string,string>>`, `writeEnvKeys(keys): Promise<void>` — firma cambia de síncrona a asíncrona; toda la Task 6 (server-manager) depende de las variables de entorno `DASHBOARD_CRED_BROKER_URL`/`DASHBOARD_CRED_BROKER_TOKEN` que estas funciones leen.

`readEnvVar`/`writeEnvVar` (usadas por `DASHBOARD_CONFIG` y `DASHBOARD_PREFERENCES` en `app/api/config/route.ts`) NO cambian — esos datos no son sensibles y siguen en `.env` tal cual.

- [ ] **Step 1: Reescribir `readEnvKeys`/`writeEnvKeys`**

En `lib/env-keys.server.ts`, sustituye las dos funciones finales (líneas 59-65) y añade el import:

```ts
import fs from 'fs';
import path from 'path';
import { resolveBrokerConfig, readKeysFromBroker, writeKeysToBroker } from './cred-broker-client';

const KEYS_VAR = 'DASHBOARD_PROVIDER_KEYS';

// ... readEnvVar / writeEnvVar / resolveEnvFile se quedan exactamente igual ...

export async function readEnvKeys(): Promise<Record<string, string>> {
  const broker = resolveBrokerConfig(process.env);
  if (broker) return readKeysFromBroker(broker);
  return readEnvVar<Record<string, string>>(KEYS_VAR, {});
}

export async function writeEnvKeys(keys: Record<string, string>): Promise<void> {
  const broker = resolveBrokerConfig(process.env);
  if (broker) return writeKeysToBroker(broker, keys);
  writeEnvVar(KEYS_VAR, keys);
}
```

- [ ] **Step 2: Actualizar `app/api/keys/route.ts`**

```ts
export async function GET() {
  return NextResponse.json(await readEnvKeys());
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { data?: Record<string, string> };
    const incoming = body && typeof body.data === 'object' ? body.data : {};
    const existing = await readEnvKeys();
    const merged = { ...existing, ...incoming };
    await writeEnvKeys(merged);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
}
```

- [ ] **Step 3: Actualizar `app/api/usage/route.ts:31`**

```ts
  const keys = await readEnvKeys();
```

- [ ] **Step 4: Actualizar `lib/browser-login.server.ts`**

Línea 81-85, hacer `saveSecretForProvider` async:

```ts
async function saveSecretForProvider(providerId: string, secret: string) {
  const currentKeys = await readEnvKeys();
  currentKeys[providerId] = secret;
  await writeEnvKeys(currentKeys);
}
```

Y en cada una de las 4 llamadas (líneas 286, 529, 698, 880), añadir `await`:

```ts
await saveSecretForProvider(session.providerId, secret);
```
```ts
await saveSecretForProvider(session.providerId, secretPayload);
```
(misma forma en las tres restantes). Las cuatro llamadas ya están dentro de funciones `async` que hacen `await` a operaciones de Playwright cerca de esas líneas — si alguna no lo estuviera, `next build` lo señalará en el Step 6 y habrá que envolver esa función en `async` también.

- [ ] **Step 5: Excluir `scratch/` del type-check**

En `tsconfig.json`, añade `"scratch"` a `exclude`:

```json
  "exclude": [
    "node_modules",
    ".next",
    "scratch"
  ]
```

`scratch/*.ts` son scripts de prueba sueltos (ya excluidos de git vía `.gitignore`, ver comentario "Scripts de prueba sueltos, no forman parte de la app") que llaman a `readEnvKeys()` de forma síncrona; con la nueva firma async dejarían de tipar. Excluirlos del type-check es coherente con que ya no se consideran parte de la app.

- [ ] **Step 6: Verificar tipos y build**

Run: `npm run lint && npm run build`
Expected: ambos terminan sin errores. Si `next build` señala una llamada a `saveSecretForProvider` fuera de una función `async`, envuelve esa función en `async` y vuelve a compilar.

- [ ] **Step 7: Verificar el flujo sin broker (modo navegador sin Electron)**

Run: `npm run dev` en una terminal, y en otra:
```bash
curl -s http://127.0.0.1:3000/api/keys
```
Expected: HTTP 200 con el JSON de claves existente en `.env` (idéntico a como funcionaba antes del cambio — confirma que el fallback a fichero sigue intacto). Detén `npm run dev` (Ctrl+C) al terminar.

- [ ] **Step 8: Commit**

```bash
git add lib/env-keys.server.ts app/api/keys/route.ts app/api/usage/route.ts lib/browser-login.server.ts tsconfig.json
git commit -m "feat: hacer asíncronas las claves de proveedor para soportar el broker de credenciales"
```

---

### Task 4: Almacén cifrado puro (`electron/lib/credential-store.js`)

**Files:**
- Create: `electron/lib/credential-store.js`
- Test: `electron/lib/credential-store.test.js`

**Interfaces:**
- Produces: `createCredentialStore({safeStorage, filePath, fsImpl?}): {load(), save(keys)}`, `migrateFromLegacyEnv(envFilePath, fsImpl?): Record<string,string>|null` — consumidos por `electron/credential-broker.js` (Task 5).
- Consumes: una interfaz `safeStorage`-like inyectada (`isEncryptionAvailable()`, `encryptString()`, `decryptString()`) — en producción será el `safeStorage` real de Electron (Task 11); en los tests, un doble de prueba.

- [ ] **Step 1: Escribir los tests**

Crea `electron/lib/credential-store.test.js`:

```js
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
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test electron/lib/credential-store.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

Crea `electron/lib/credential-store.js`:

```js
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
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test electron/lib/credential-store.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/lib/credential-store.js electron/lib/credential-store.test.js
git commit -m "feat: añadir almacén de credenciales cifrado con safeStorage inyectable"
```

---

### Task 5: Broker HTTP de credenciales (`electron/credential-broker.js`)

**Files:**
- Create: `electron/credential-broker.js`
- Test: `electron/credential-broker.test.js`

**Interfaces:**
- Consumes: `createCredentialStore`, `migrateFromLegacyEnv` de `electron/lib/credential-store.js` (Task 4).
- Produces: `startCredentialBroker({safeStorage, filePath, legacyEnvPath?}): Promise<{url, token, close()}>` — consumido por `electron/main.js` (Task 11) y por `lib/env-keys.server.ts` vía las variables de entorno que `server-manager.js` propaga.

- [ ] **Step 1: Escribir los tests**

Crea `electron/credential-broker.test.js`:

```js
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
  await broker.close();
});

test('unknown path returns 404', async () => {
  const broker = await startCredentialBroker({ safeStorage: fakeSafeStorage(), filePath: path.join(tmpDir(), 'c.enc') });
  const res = await request(`${broker.url}/other`, { token: broker.token });
  assert.equal(res.status, 404);
  await broker.close();
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test electron/credential-broker.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

Crea `electron/credential-broker.js`:

```js
'use strict';

const http = require('http');
const crypto = require('crypto');
const { createCredentialStore, migrateFromLegacyEnv } = require('./lib/credential-store');

// Arranca un servidor HTTP solo-loopback que hace de intermediario para leer
// y escribir credenciales cifradas: el servidor Next.js (proceso Node hijo
// aparte) no puede llamar a safeStorage directamente porque no es un proceso
// Electron. El token evita que cualquier otro proceso local que adivine el
// puerto pueda leer secretos.
function startCredentialBroker({ safeStorage, filePath, legacyEnvPath }) {
  const store = createCredentialStore({ safeStorage, filePath });
  const token = crypto.randomBytes(24).toString('hex');

  // Importación única: si no hay almacén cifrado todavía pero existe un
  // .env antiguo con DASHBOARD_PROVIDER_KEYS, se usa para sembrar el
  // almacén cifrado, así quien actualiza no pierde proveedores ya conectados.
  const existing = store.load();
  if (Object.keys(existing).length === 0 && legacyEnvPath) {
    const legacy = migrateFromLegacyEnv(legacyEnvPath);
    if (legacy && Object.keys(legacy).length > 0) {
      store.save(legacy);
    }
  }

  function authorized(req) {
    return (req.headers['authorization'] || '') === `Bearer ${token}`;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  const server = http.createServer((req, res) => {
    if (req.url !== '/credentials') {
      res.writeHead(404).end();
      return;
    }
    if (!authorized(req)) {
      res.writeHead(401).end();
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(store.load()));
      return;
    }
    if (req.method === 'PUT') {
      readBody(req).then((body) => {
        try {
          const keys = JSON.parse(body || '{}');
          store.save(keys);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400).end();
        }
      });
      return;
    }
    res.writeHead(405).end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        token,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

module.exports = { startCredentialBroker };
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test electron/credential-broker.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/credential-broker.js electron/credential-broker.test.js
git commit -m "feat: añadir broker HTTP local de credenciales cifradas"
```

---

### Task 6: Gestor del servidor Next.js (`electron/server-manager.js`)

**Files:**
- Create: `electron/server-manager.js`
- Test: `electron/server-manager.test.js`

**Interfaces:**
- Produces: `probePort(host,port,timeoutMs?): Promise<boolean>`, `waitForServer(host,port,{retries?,delayMs?}): Promise<boolean>`, `spawnServer({standaloneDir,port,host,envFile,execPath,brokerUrl,brokerToken,onExit}): ChildProcess` — consumidos por `electron/main.js` (Task 11).

- [ ] **Step 1: Escribir los tests**

Crea `electron/server-manager.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { probePort, waitForServer } = require('./server-manager');

test('probePort resolves true when something answers on that host/port', async () => {
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  assert.equal(await probePort('127.0.0.1', port), true);
  await new Promise((resolve) => server.close(resolve));
});

test('probePort resolves false when nothing is listening', async () => {
  assert.equal(await probePort('127.0.0.1', 1, 200), false);
});

test('waitForServer gives up and resolves false after exhausting its retries', async () => {
  const result = await waitForServer('127.0.0.1', 1, { retries: 2, delayMs: 10 });
  assert.equal(result, false);
});

test('waitForServer resolves true as soon as the port starts responding', async () => {
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const result = await waitForServer('127.0.0.1', port, { retries: 5, delayMs: 10 });
  assert.equal(result, true);
  await new Promise((resolve) => server.close(resolve));
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test electron/server-manager.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

Crea `electron/server-manager.js`:

```js
'use strict';

const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

function probePort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitForServer(host, port, { retries = 75, delayMs = 400 } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await probePort(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

// standaloneDir debe contener server-entry.js, inspector-shim.js y
// standalone/server.js (ver scripts/prepare-standalone.js, Task 12).
// Se lanza con ELECTRON_RUN_AS_NODE=1 para reutilizar el propio binario de
// Electron (process.execPath) como runtime Node del proceso hijo, sin
// depender de que el usuario tenga Node.js instalado ni de pkg.
function spawnServer({ standaloneDir, port, host, envFile, execPath, brokerUrl, brokerToken, onExit }) {
  const entryPath = path.join(standaloneDir, 'server-entry.js');
  const child = spawn(execPath, [entryPath], {
    cwd: path.join(standaloneDir, 'standalone'),
    env: Object.assign({}, process.env, {
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: host,
      DASHBOARD_ENV_FILE: envFile,
      DASHBOARD_CRED_BROKER_URL: brokerUrl,
      DASHBOARD_CRED_BROKER_TOKEN: brokerToken,
    }),
    stdio: 'inherit',
  });
  child.on('exit', (code) => { if (onExit) onExit(code); });
  return child;
}

module.exports = { probePort, waitForServer, spawnServer };
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test electron/server-manager.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/server-manager.js electron/server-manager.test.js
git commit -m "feat: añadir gestor de arranque del servidor Next.js para Electron"
```

---

### Task 7: Icono de bandeja — color puro (`electron/lib/tray-badge.js`)

**Files:**
- Create: `electron/lib/tray-badge.js`
- Test: `electron/lib/tray-badge.test.js`

**Interfaces:**
- Produces: `COLORS` (objeto con `ok`/`warning`/`critical`/`neutral`, mismos tonos que `statusColors` de `ProviderCard.tsx`), `worstStatusColor(statuses: string[]): {r,g,b}`, `generateBadgeBuffer(color,size?): {width,height,buffer}` — consumidos por `electron/tray.js` (Task 9).

- [ ] **Step 1: Escribir los tests**

Crea `electron/lib/tray-badge.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { COLORS, worstStatusColor, generateBadgeBuffer } = require('./tray-badge');

test('worstStatusColor prioritizes critical over warning and ok', () => {
  assert.deepEqual(worstStatusColor(['online', 'warning', 'error']), COLORS.critical);
});

test('worstStatusColor returns warning when nothing is worse', () => {
  assert.deepEqual(worstStatusColor(['online', 'warning']), COLORS.warning);
});

test('worstStatusColor returns neutral when every provider is unconfigured', () => {
  assert.deepEqual(worstStatusColor(['unconfigured', 'unconfigured']), COLORS.neutral);
});

test('worstStatusColor returns neutral for an empty list', () => {
  assert.deepEqual(worstStatusColor([]), COLORS.neutral);
});

test('worstStatusColor returns ok when everything is online', () => {
  assert.deepEqual(worstStatusColor(['online', 'online']), COLORS.ok);
});

test('generateBadgeBuffer fills every pixel with the requested opaque color', () => {
  const { width, height, buffer } = generateBadgeBuffer(COLORS.critical, 4);
  assert.equal(width, 4);
  assert.equal(height, 4);
  assert.equal(buffer.length, 4 * 4 * 4);
  const lastOffset = (4 * 4 - 1) * 4;
  assert.deepEqual(
    [buffer[lastOffset], buffer[lastOffset + 1], buffer[lastOffset + 2], buffer[lastOffset + 3]],
    [244, 63, 94, 255]
  );
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test electron/lib/tray-badge.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

Crea `electron/lib/tray-badge.js`:

```js
'use strict';

// Generación pura de buffers RGBA — sin 'require(electron)' aquí, para que
// sea testeable con `node --test` sin que Electron esté corriendo.
// electron/tray.js envuelve el resultado con nativeImage.createFromBuffer(),
// eso sí necesita el runtime real de Electron.
const COLORS = {
  ok: { r: 16, g: 185, b: 129 },       // emerald-500, igual que 'online' en ProviderCard
  warning: { r: 245, g: 158, b: 11 },  // amber-500, igual que 'warning' en ProviderCard
  critical: { r: 244, g: 63, b: 94 },  // rose-500, igual que 'offline'/'error' en ProviderCard
  neutral: { r: 100, g: 116, b: 139 }, // slate-500, igual que 'unconfigured' en ProviderCard
};

// El peor estado entre todos los proveedores decide el color del icono
// único de bandeja — replica statusColors de ProviderCard.tsx para que el
// icono nunca sugiera algo que las tarjetas no dicen.
function worstStatusColor(statuses) {
  if (statuses.some((s) => s === 'error' || s === 'offline')) return COLORS.critical;
  if (statuses.some((s) => s === 'warning')) return COLORS.warning;
  if (statuses.length === 0 || statuses.every((s) => s === 'unconfigured')) return COLORS.neutral;
  return COLORS.ok;
}

function generateBadgeBuffer(color, size = 16) {
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    buffer[offset] = color.r;
    buffer[offset + 1] = color.g;
    buffer[offset + 2] = color.b;
    buffer[offset + 3] = 255;
  }
  return { width: size, height: size, buffer };
}

module.exports = { COLORS, worstStatusColor, generateBadgeBuffer };
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test electron/lib/tray-badge.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/lib/tray-badge.js electron/lib/tray-badge.test.js
git commit -m "feat: añadir generación pura del color del icono de bandeja"
```

---

### Task 8: Poller de uso (`electron/usage-poller.js`)

**Files:**
- Create: `electron/usage-poller.js`
- Test: `electron/usage-poller.test.js`

**Interfaces:**
- Produces: `fetchDashboardSnapshot(serverUrl): Promise<{providers, preferences}>`, `startUsagePolling({serverUrl,onUpdate,onError?,defaultIntervalMs?,fetchSnapshot?}): stop()` — consumido por `electron/main.js` (Task 11) y por `electron/tray.js` (Task 9, vía los `providers` que llegan en cada `onUpdate`).
- Consumes: `fetch` global de Node (disponible en Electron main y en Node ≥18) contra `GET /api/config` y `POST /api/usage` del servidor ya arrancado (Task 6).

- [ ] **Step 1: Escribir los tests**

Crea `electron/usage-poller.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startUsagePolling } = require('./usage-poller');

test('startUsagePolling calls onUpdate immediately and again after the configured interval', async () => {
  let calls = 0;
  const fakeSnapshot = async () => {
    calls++;
    return { providers: [], preferences: { refreshWidgetSeconds: 0.02 } }; // 20ms
  };
  const updates = [];
  const stop = startUsagePolling({ serverUrl: 'http://x', onUpdate: (s) => updates.push(s), fetchSnapshot: fakeSnapshot });
  await new Promise((r) => setTimeout(r, 60));
  stop();
  assert.ok(calls >= 2, `expected at least 2 polls, got ${calls}`);
  assert.ok(updates.length >= 2);
});

test('startUsagePolling reports fetch failures via onError instead of throwing', async () => {
  const errors = [];
  const fakeSnapshot = async () => { throw new Error('network down'); };
  const stop = startUsagePolling({ serverUrl: 'http://x', onUpdate: () => {}, onError: (e) => errors.push(e), defaultIntervalMs: 20 });
  await new Promise((r) => setTimeout(r, 30));
  stop();
  assert.ok(errors.length >= 1);
  assert.equal(errors[0].message, 'network down');
});

test('stop() prevents further polling', async () => {
  let calls = 0;
  const fakeSnapshot = async () => { calls++; return { providers: [], preferences: { refreshWidgetSeconds: 0.01 } }; };
  const stop = startUsagePolling({ serverUrl: 'http://x', onUpdate: () => {}, fetchSnapshot: fakeSnapshot });
  await new Promise((r) => setTimeout(r, 15));
  stop();
  const callsAtStop = calls;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, callsAtStop);
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test electron/usage-poller.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

Crea `electron/usage-poller.js`:

```js
'use strict';

// Todo el polling ocurre en el proceso principal, nunca en el renderer: el
// renderer del widget se carga con loadFile() (origen file://), y un fetch()
// cross-origin desde ahí contra http://127.0.0.1:3000 sería bloqueado por
// CORS salvo que tocáramos las rutas API existentes para añadir cabeceras
// (fuera de alcance). El fetch() global de Node en el proceso principal no
// tiene esa restricción.

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function fetchDashboardSnapshot(serverUrl) {
  const configRes = await fetchJson(`${serverUrl}/api/config`);
  const providers = configRes.providers || [];
  const withUsage = await Promise.all(
    providers.map(async (provider) => {
      if (!provider.apiKey) return provider;
      try {
        const usage = await fetchJson(`${serverUrl}/api/usage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: provider.id, provider: provider.provider }),
        });
        return { ...provider, usage };
      } catch (err) {
        return {
          ...provider,
          usage: { fetchedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) },
        };
      }
    })
  );
  return { providers: withUsage, preferences: configRes.preferences };
}

function startUsagePolling({ serverUrl, onUpdate, onError, defaultIntervalMs = 300000, fetchSnapshot = fetchDashboardSnapshot }) {
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    let intervalMs = defaultIntervalMs;
    try {
      const snapshot = await fetchSnapshot(serverUrl);
      intervalMs = (snapshot.preferences?.refreshWidgetSeconds || 300) * 1000;
      onUpdate(snapshot);
    } catch (err) {
      if (onError) onError(err);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  }

  tick();
  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = { fetchDashboardSnapshot, startUsagePolling };
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test electron/usage-poller.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/usage-poller.js electron/usage-poller.test.js
git commit -m "feat: añadir poller de uso del proceso principal"
```

---

### Task 9: Bandeja del sistema (`electron/tray.js`)

**Files:**
- Create: `electron/tray.js`

**Interfaces:**
- Consumes: `worstStatusColor`, `generateBadgeBuffer`, `COLORS` de `electron/lib/tray-badge.js` (Task 7).
- Produces: `createTray({onShowWidget,onOpenBrowser,onRestartServer,onQuit}): {updateFromProviders(providers), setServerDown(), destroy()}`, `summarizeTooltip(providers): string` — consumidos por `electron/main.js` (Task 11).

Este módulo importa `electron` (`Tray`, `Menu`, `nativeImage`) por lo que `createTray()` en sí solo se puede ejercitar con Electron corriendo (se conecta en `electron/main.js`, Task 11, y se verifica visualmente en Task 13). `summarizeTooltip` es pura y sí se prueba aquí con `node --test` — `require('electron')` fuera de un proceso Electron no lanza excepción (devuelve una cadena con la ruta al binario), solo hace que `Tray`/`Menu`/`nativeImage` sean `undefined`, así que el módulo se puede cargar igualmente en el test siempre que no se llame a `createTray()`.

- [ ] **Step 1: Escribir el test de `summarizeTooltip`**

Crea `electron/tray.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeTooltip } = require('./tray');

test('summarizeTooltip reports weekly utilization when present', () => {
  const text = summarizeTooltip([{ name: 'Claude Pro', usage: { weeklyUtilization: 42.4 } }]);
  assert.equal(text, 'Claude Pro: 42% semanal');
});

test('summarizeTooltip falls back to session utilization', () => {
  const text = summarizeTooltip([{ name: 'Gemini', usage: { sessionUtilization: 10 } }]);
  assert.equal(text, 'Gemini: 10% sesión');
});

test('summarizeTooltip shows balance for API-key providers', () => {
  const text = summarizeTooltip([{ name: 'DeepSeek', usage: { balance: 12.5, currency: 'USD' } }]);
  assert.equal(text, 'DeepSeek: 12.50 USD');
});

test('summarizeTooltip reports missing sessions without inventing data', () => {
  const text = summarizeTooltip([{ name: 'OpenAI', usage: { error: 'sesión caducada' } }]);
  assert.equal(text, 'OpenAI: sin sesión');
});

test('summarizeTooltip handles an empty provider list', () => {
  assert.equal(summarizeTooltip([]), 'Dashboard de uso de APIs — sin proveedores configurados');
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `node --test electron/tray.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

Crea `electron/tray.js`:

```js
'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const { worstStatusColor, generateBadgeBuffer, COLORS } = require('./lib/tray-badge');

function iconFromColor(color) {
  const { width, height, buffer } = generateBadgeBuffer(color, 16);
  return nativeImage.createFromBuffer(buffer, { width, height });
}

function summarizeTooltip(providers) {
  if (!providers || providers.length === 0) {
    return 'Dashboard de uso de APIs — sin proveedores configurados';
  }
  const lines = providers.map((p) => {
    const u = p.usage;
    if (!u || u.error) return `${p.name}: sin sesión`;
    if (u.weeklyUtilization !== undefined) return `${p.name}: ${Math.round(u.weeklyUtilization)}% semanal`;
    if (u.sessionUtilization !== undefined) return `${p.name}: ${Math.round(u.sessionUtilization)}% sesión`;
    if (u.balance !== undefined) return `${p.name}: ${u.balance.toFixed(2)} ${u.currency || ''}`.trim();
    return `${p.name}: sin datos`;
  });
  return lines.join('\n');
}

function createTray({ onShowWidget, onOpenBrowser, onRestartServer, onQuit }) {
  const tray = new Tray(iconFromColor(COLORS.neutral));
  tray.setToolTip('Dashboard de uso de APIs — iniciando…');

  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar widget', click: () => onShowWidget && onShowWidget() },
    { label: 'Abrir en navegador', click: () => onOpenBrowser && onOpenBrowser() },
    { type: 'separator' },
    { label: 'Reiniciar servidor', click: () => onRestartServer && onRestartServer() },
    { type: 'separator' },
    { label: 'Salir', click: () => onQuit && onQuit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => onShowWidget && onShowWidget());

  return {
    updateFromProviders(providers) {
      const color = worstStatusColor(providers.map((p) => p.status));
      tray.setImage(iconFromColor(color));
      tray.setToolTip(summarizeTooltip(providers));
    },
    setServerDown() {
      tray.setImage(iconFromColor(COLORS.critical));
      tray.setToolTip('Dashboard de uso de APIs — el servidor no responde');
    },
    destroy() {
      tray.destroy();
    },
  };
}

module.exports = { createTray, summarizeTooltip };
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `node --test electron/tray.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/tray.js electron/tray.test.js
git commit -m "feat: añadir icono de bandeja con color de estado y tooltip resumen"
```

---

### Task 10: Ventana del widget, preload y renderer

**Files:**
- Create: `electron/preload.js`
- Create: `electron/widget-window.js`
- Create: `electron/renderer/widget.html`
- Create: `electron/renderer/widget.css`
- Create: `electron/renderer/widget.js`

**Interfaces:**
- Produces: `createWidgetWindow({store, serverUrl}): BrowserWindow` — consumido por `electron/main.js` (Task 11). `window.widgetAPI` en el renderer (`onUsageUpdate`, `resize`, `openDashboard`).
- Consumes: `electron-store` (instancia `store` creada en `main.js`), IPC `usage-update` enviado desde el proceso principal (Task 11) con el payload `{providers, preferences}` de `fetchDashboardSnapshot`.

Módulo dependiente de una ventana/pantalla real — no se prueba con `node --test`. Se verifica con una captura de pantalla real en el Step 5.

- [ ] **Step 1: Preload**

Crea `electron/preload.js`:

```js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetAPI', {
  onUsageUpdate: (callback) => {
    ipcRenderer.on('usage-update', (_event, data) => callback(data));
  },
  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status));
  },
  resize: (height) => ipcRenderer.send('widget-resize', height),
  openDashboard: () => ipcRenderer.send('widget-open-dashboard'),
});
```

- [ ] **Step 2: Ventana**

Crea `electron/widget-window.js`:

```js
'use strict';

const { BrowserWindow, screen, ipcMain, shell } = require('electron');
const path = require('path');

const WIDGET_WIDTH = 340;
const HEADER_HEIGHT = 56;
const CARD_HEIGHT = 64;

function isPositionOnScreen(x, y, width, height) {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y;
  });
}

function getCenteredPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
  };
}

function createWidgetWindow({ store, serverUrl }) {
  const initialHeight = HEADER_HEIGHT + CARD_HEIGHT;
  let savedPosition = store.get('windowPosition');
  if (savedPosition && !isPositionOnScreen(savedPosition.x, savedPosition.y, WIDGET_WIDTH, initialHeight)) {
    savedPosition = null;
  }

  const win = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: initialHeight,
    x: savedPosition ? savedPosition.x : undefined,
    y: savedPosition ? savedPosition.y : undefined,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!savedPosition) {
    const { x, y } = getCenteredPosition(WIDGET_WIDTH, initialHeight);
    win.setPosition(x, y);
  }

  win.loadFile(path.join(__dirname, 'renderer', 'widget.html'));

  let saveTimer = null;
  win.on('move', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const [x, y] = win.getPosition();
      store.set('windowPosition', { x, y });
    }, 300);
  });

  // Cerrar la ventana solo la oculta — la bandeja es la única forma de
  // salir de verdad (mismo patrón que el proyecto de referencia).
  win.on('close', (event) => {
    event.preventDefault();
    win.hide();
  });

  ipcMain.on('widget-resize', (event, height) => {
    if (event.sender !== win.webContents) return;
    const [width] = win.getSize();
    // El suelo es solo la cabecera, no initialHeight (cabecera+tarjeta):
    // con la ventana colapsada, el contenido real es más bajo que
    // initialHeight y debe poder encoger hasta ahí.
    win.setContentSize(width, Math.max(HEADER_HEIGHT, Math.round(height)));
  });

  ipcMain.on('widget-open-dashboard', () => {
    shell.openExternal(serverUrl);
  });

  return win;
}

module.exports = { createWidgetWindow, isPositionOnScreen, getCenteredPosition };
```

- [ ] **Step 3: Renderer — HTML**

Crea `electron/renderer/widget.html`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Dashboard de uso de APIs</title>
  <link rel="stylesheet" href="widget.css" />
</head>
<body>
  <header id="header">
    <span id="title">Uso de APIs</span>
    <div id="header-actions">
      <button id="toggle-collapse" title="Colapsar/expandir">▾</button>
      <button id="open-dashboard" title="Abrir dashboard completo">⤢</button>
    </div>
  </header>
  <div id="banner">El servidor no responde</div>
  <main id="cards"></main>
  <script src="widget.js"></script>
</body>
</html>
```

- [ ] **Step 4: Renderer — CSS y JS**

Crea `electron/renderer/widget.css`:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, "Segoe UI", sans-serif;
  background: #14141ecc;
  color: #e2e8f0;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.12);
  overflow: hidden;
  -webkit-app-region: drag;
}

#header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #67e8f9;
}

#header-actions {
  display: flex;
  gap: 6px;
  -webkit-app-region: no-drag;
}

#open-dashboard,
#toggle-collapse {
  -webkit-app-region: no-drag;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  color: #e2e8f0;
  border-radius: 8px;
  width: 26px;
  height: 26px;
  cursor: pointer;
}

#banner {
  display: none;
  background: #f43f5e;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 10px;
  text-align: center;
  -webkit-app-region: no-drag;
}

body.server-down #banner {
  display: block;
}

body.server-down #cards {
  opacity: 0.45;
}

body.collapsed #cards {
  display: none;
}

#cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 12px 12px;
}

.card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12.5px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.name {
  flex: 1;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.value {
  color: #94a3b8;
  white-space: nowrap;
}

.empty {
  padding: 10px;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}
```

Crea `electron/renderer/widget.js`:

```js
'use strict';

const cardsEl = document.getElementById('cards');
const openBtn = document.getElementById('open-dashboard');
const collapseBtn = document.getElementById('toggle-collapse');

openBtn.addEventListener('click', () => window.widgetAPI.openDashboard());

// Estado de colapsado persistido en localStorage del propio renderer (no
// necesita pasar por electron-store: solo afecta a esta ventana y no hace
// falta compartirlo con el proceso principal).
function applyCollapsed(collapsed) {
  document.body.classList.toggle('collapsed', collapsed);
  collapseBtn.textContent = collapsed ? '▸' : '▾';
  requestAnimationFrame(() => window.widgetAPI.resize(document.body.scrollHeight));
}

let collapsed = localStorage.getItem('widgetCollapsed') === '1';
applyCollapsed(collapsed);

collapseBtn.addEventListener('click', () => {
  collapsed = !collapsed;
  localStorage.setItem('widgetCollapsed', collapsed ? '1' : '0');
  applyCollapsed(collapsed);
});

window.widgetAPI.onServerStatus((status) => {
  document.body.classList.toggle('server-down', Boolean(status && status.down));
});

const STATUS_COLORS = {
  online: '#10b981',
  warning: '#f59e0b',
  offline: '#f43f5e',
  error: '#f43f5e',
  unconfigured: '#64748b',
};

function formatUsageLine(usage) {
  if (!usage) return 'Sin datos todavía';
  if (usage.error) return usage.error;
  if (usage.weeklyUtilization !== undefined) return `${Math.round(usage.weeklyUtilization)}% semanal`;
  if (usage.sessionUtilization !== undefined) return `${Math.round(usage.sessionUtilization)}% sesión`;
  if (usage.balance !== undefined) return `${usage.balance.toFixed(2)} ${usage.currency || ''}`.trim();
  return 'Sin datos disponibles';
}

function renderProviders(providers) {
  cardsEl.innerHTML = '';
  const visible = (providers || []).filter((p) => p.visibility !== 'hidden');

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay proveedores configurados todavía.';
    cardsEl.appendChild(empty);
  } else {
    visible.forEach((provider) => {
      const card = document.createElement('div');
      card.className = 'card';

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = STATUS_COLORS[provider.status] || STATUS_COLORS.unconfigured;

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = provider.name;

      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = formatUsageLine(provider.usage);

      // El diseño aprobado especifica que un clic en una tarjeta abre esa
      // integración en el dashboard completo para reconectar/ajustar. La
      // web no tiene hoy un deep-link a una tarjeta concreta, así que abre
      // el dashboard general — el usuario localiza la tarjeta desde ahí.
      card.append(dot, name, value);
      card.addEventListener('click', () => window.widgetAPI.openDashboard());
      cardsEl.appendChild(card);
    });
  }

  requestAnimationFrame(() => {
    window.widgetAPI.resize(document.body.scrollHeight);
  });
}

window.widgetAPI.onUsageUpdate((data) => renderProviders(data.providers));
```

- [ ] **Step 5: Verificación manual con captura de pantalla**

Este paso requiere que `electron` esté instalado (Task 11 lo añade como dependencia) — si se ejecuta esta Task antes que la 11, instala Electron primero: `npm install --save-dev electron`.

Crea un script temporal `scratch/screenshot-widget.js` (no forma parte de la app, ya está excluido de git y de `tsconfig`):

```js
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 340, height: 200, frame: false, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload.js') },
  });
  await win.loadFile(path.join(__dirname, '..', 'electron', 'renderer', 'widget.html'));
  // renderProviders() es una function declaration de nivel superior en
  // widget.js (script clásico, no módulo), así que queda expuesta como
  // window.renderProviders pese al 'use strict' del fichero.
  await win.webContents.executeJavaScript(`
    renderProviders([
      { name: 'OpenAI', status: 'online', usage: { balance: 42.10, currency: 'USD' } },
      { name: 'Claude Pro', status: 'warning', usage: { weeklyUtilization: 82 } },
      { name: 'DeepSeek', status: 'unconfigured' }
    ]);
  `);
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'widget-screenshot.png'), image.toPNG());
  app.quit();
});
```

Run: `npx electron scratch/screenshot-widget.js`
Expected: se genera `scratch/widget-screenshot.png` sin errores en consola.

Después, usa la herramienta de lectura de archivos para abrir `scratch/widget-screenshot.png` y comprobar visualmente que las tres tarjetas de ejemplo se ven correctamente (punto de color, nombre, valor). Borra `scratch/screenshot-widget.js` al terminar (era solo para esta verificación).

- [ ] **Step 6: Commit**

```bash
git add electron/preload.js electron/widget-window.js electron/renderer/
git commit -m "feat: añadir ventana flotante del widget y su renderer"
```

---

### Task 11: Empaquetado de dependencias y `electron/main.js`

**Files:**
- Modify: `package.json` (añadir `main`, `scripts`, `dependencies`, `devDependencies`)
- Create: `electron/main.js`

**Interfaces:**
- Consumes: todo lo producido en las Tasks 5-10 (`startCredentialBroker`, `waitForServer`/`spawnServer`, `createTray`, `createWidgetWindow`, `startUsagePolling`).

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
npm install --save-dev electron electron-builder
npm install electron-store
```

- [ ] **Step 2: Añadir `main` y scripts a `package.json`**

En `package.json`, añade `"main": "electron/main.js"` al nivel raíz (junto a `"name"`, `"version"`), y añade a `"scripts"`:

```json
    "test": "node --test lib electron",
    "electron:dev": "node scripts/prepare-standalone.js && electron .",
    "electron:build": "node scripts/prepare-standalone.js && electron-builder --win"
```

(`scripts/prepare-standalone.js` se crea en la Task 12; hasta entonces `electron:dev`/`electron:build` no funcionarán, pero `npm test` sí, desde la Task 2 en adelante).

- [ ] **Step 3: Implementar `electron/main.js`**

Crea `electron/main.js`:

```js
'use strict';

const { app, BrowserWindow, safeStorage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { startCredentialBroker } = require('./credential-broker');
const { waitForServer, spawnServer } = require('./server-manager');
const { createTray } = require('./tray');
const { createWidgetWindow } = require('./widget-window');
const { startUsagePolling } = require('./usage-poller');

const PORT = Number(process.env.DASHBOARD_PORT) || 3000;
const HOST = '127.0.0.1';
const SERVER_URL = `http://${HOST}:${PORT}`;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  const store = new Store();
  let serverChild = null;
  let widgetWindow = null;
  let tray = null;
  let stopPolling = null;

  app.on('second-instance', () => {
    if (widgetWindow) {
      if (widgetWindow.isMinimized()) widgetWindow.restore();
      widgetWindow.show();
      widgetWindow.focus();
    }
  });

  function standaloneDir() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'standalone-bundle')
      : path.join(__dirname, '..', 'build', 'standalone-bundle');
  }

  function envFilePath() {
    return app.isPackaged
      ? path.join(app.getPath('userData'), '.env')
      : path.join(__dirname, '..', '.env');
  }

  async function startServer(broker) {
    console.log('[widget] Arrancando servidor en ' + SERVER_URL);
    serverChild = spawnServer({
      standaloneDir: standaloneDir(),
      port: PORT,
      host: HOST,
      envFile: envFilePath(),
      execPath: process.execPath,
      brokerUrl: broker.url,
      brokerToken: broker.token,
      onExit: (code) => {
        console.log('[widget] Servidor Next.js terminó con código ' + code);
        serverChild = null;
        if (tray) tray.setServerDown();
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          widgetWindow.webContents.send('server-status', { down: true });
        }
      },
    });
    const up = await waitForServer(HOST, PORT);
    if (!up) {
      console.error('[widget] El servidor no respondió a tiempo.');
      return false;
    }
    console.log('[widget] Servidor listo.');
    return true;
  }

  async function restartServer(broker) {
    if (serverChild) {
      serverChild.kill();
      serverChild = null;
    }
    await startServer(broker);
  }

  app.whenReady().then(async () => {
    const broker = await startCredentialBroker({
      safeStorage,
      filePath: path.join(app.getPath('userData'), 'credentials.enc'),
      legacyEnvPath: envFilePath(),
    });
    console.log('[widget] Broker de credenciales escuchando en ' + broker.url);

    const ok = await startServer(broker);
    if (!ok) return;

    widgetWindow = createWidgetWindow({ store, serverUrl: SERVER_URL });

    tray = createTray({
      onShowWidget: () => { widgetWindow.show(); widgetWindow.focus(); },
      onOpenBrowser: () => shell.openExternal(SERVER_URL),
      onRestartServer: () => restartServer(broker),
      onQuit: () => app.quit(),
    });

    stopPolling = startUsagePolling({
      serverUrl: SERVER_URL,
      onUpdate: (snapshot) => {
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          // Un sondeo que sí responde confirma que el servidor está vivo:
          // limpia cualquier aviso de "servidor no responde" previo antes
          // de empujar los datos nuevos.
          widgetWindow.webContents.send('server-status', { down: false });
          widgetWindow.webContents.send('usage-update', snapshot);
        }
        if (tray) tray.updateFromProviders(snapshot.providers || []);
      },
      onError: (err) => {
        console.error('[widget] Error consultando el dashboard:', err.message);
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          widgetWindow.webContents.send('server-status', { down: true });
        }
      },
    });
  });

  app.on('window-all-closed', () => {
    // La bandeja mantiene la app viva; este proyecto solo soporta Windows.
  });

  app.on('before-quit', () => {
    if (stopPolling) stopPolling();
    if (serverChild) serverChild.kill();
    if (tray) tray.destroy();
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json electron/main.js
git commit -m "feat: añadir electron/main.js y dependencias de Electron"
```

(Nota: `electron:dev` todavía no arranca — falta `scripts/prepare-standalone.js`, Task 12. Es esperado.)

---

### Task 12: Preparación del bundle standalone y arranque real

**Files:**
- Create: `scripts/prepare-standalone.js`

**Interfaces:**
- Consumes: `.next/standalone` (generado por `npm run build`, sin cambios respecto a hoy).
- Produces: `build/standalone-bundle/` — consumido por `electron/server-manager.js` vía `standaloneDir()` de `electron/main.js` (Task 11).

- [ ] **Step 1: Implementar**

Crea `scripts/prepare-standalone.js` (misma lógica de copia que el actual `scripts/build-exe.js`, sin los pasos de `pkg`/`csc`):

```js
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nextStandalone = path.join(root, '.next', 'standalone');
const bundleDir = path.join(root, 'build', 'standalone-bundle');
const bundleStandalone = path.join(bundleDir, 'standalone');

if (!fs.existsSync(path.join(nextStandalone, 'server.js'))) {
  console.error('No se encuentra .next/standalone/server.js. Ejecuta antes: npm run build');
  process.exit(1);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });

copyDir(nextStandalone, bundleStandalone);
// `next build` con output:'standalone' no copia assets estáticos ni public/
// — es un paso manual documentado, igual que en el antiguo build-exe.js.
copyDir(path.join(root, '.next', 'static'), path.join(bundleStandalone, '.next', 'static'));
copyDir(path.join(root, 'public'), path.join(bundleStandalone, 'public'));

// El tracing de Next solo sigue require()/import estáticos, así que se
// pierde playwright/cli.js (referenciado con una ruta construida en
// runtime, usada para instalar Chromium en el primer login de Claude
// Pro/DeepSeek). Se copian los paquetes completos en vez de confiar en el
// tracing parcial — igual razonamiento que el antiguo build-exe.js.
copyDir(path.join(root, 'node_modules', 'playwright'), path.join(bundleStandalone, 'node_modules', 'playwright'));
copyDir(path.join(root, 'node_modules', 'playwright-core'), path.join(bundleStandalone, 'node_modules', 'playwright-core'));

fs.copyFileSync(path.join(root, 'inspector-shim.js'), path.join(bundleDir, 'inspector-shim.js'));
fs.copyFileSync(path.join(root, 'server-entry.js'), path.join(bundleDir, 'server-entry.js'));

console.log('[prepare-standalone] Bundle listo en build/standalone-bundle/');
```

- [ ] **Step 2: Generar el build de Next.js y el bundle**

Run:
```bash
npm run build
node scripts/prepare-standalone.js
```
Expected: `npm run build` termina sin errores (ya lo hacía antes de este plan); aparece `build/standalone-bundle/server-entry.js`, `build/standalone-bundle/inspector-shim.js` y `build/standalone-bundle/standalone/server.js`.

- [ ] **Step 3: Arrancar la app Electron completa por primera vez**

Run: `npm run electron:dev`

Expected en la consola (stdio heredado del proceso hijo + logs de `main.js`):
```
[widget] Broker de credenciales escuchando en http://127.0.0.1:XXXXX
[widget] Arrancando servidor en http://127.0.0.1:3000
[dashboard] Arrancando servidor en http://127.0.0.1:3000   <- log propio de server-entry.js/standalone
[widget] Servidor listo.
```

En otra terminal, confirma que el servidor responde y que el `.env` existente (con las claves reales ya configuradas en este equipo) se sigue sirviendo a través del broker:
```bash
curl -s http://127.0.0.1:3000/api/config
```
Expected: HTTP 200 con el JSON de proveedores configurados — igual que antes de este cambio, demostrando que el broker migró el `.env` existente sin pérdida de datos.

Deja la app corriendo para la Task 13 (icono de bandeja) y ciérrala con **Salir** desde la bandeja al terminar de verificar, o `Ctrl+C` en la terminal.

- [ ] **Step 4: Commit**

```bash
git add scripts/prepare-standalone.js
git commit -m "feat: añadir preparación del bundle standalone para Electron"
```

---

### Task 13: Verificación visual end-to-end del widget con datos reales

**Files:** ninguno nuevo — solo verificación manual del conjunto de las Tasks 1-12.

- [ ] **Step 1: Arrancar y capturar el widget con datos reales**

Con `npm run electron:dev` corriendo (Task 12, Step 3) y el `.env` real de este equipo ya migrado al broker, añade temporalmente estas líneas de depuración justo después de `widgetWindow = createWidgetWindow(...)` en `electron/main.js` (bórralas al final de este Step):

```js
  const fs = require('fs');
  widgetWindow.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      const image = await widgetWindow.webContents.capturePage();
      fs.writeFileSync(path.join(app.getPath('userData'), '..', 'widget-live.png'), image.toPNG());
      console.log('[widget] Captura guardada en', path.join(app.getPath('userData'), '..', 'widget-live.png'));
    }, 4000);
  });
```

Run: `npm run electron:dev`, espera a que aparezca en consola la ruta de `widget-live.png` (unos segundos después del primer `usage-update`), luego cierra la app.

- [ ] **Step 2: Revisar la captura**

Usa la herramienta de lectura de archivos para abrir el PNG generado y comprobar: las tarjetas muestran los proveedores reales configurados en este equipo, con el mismo criterio que la web (sin sesión → "sin sesión", nunca datos inventados), y el color del punto coincide con el estado de cada proveedor.

- [ ] **Step 3: Revertir la instrumentación temporal**

Elimina el bloque de depuración añadido en el Step 1 de `electron/main.js` (no debe llegar a un commit).

- [ ] **Step 4: Verificar la bandeja por log**

Añade temporalmente `console.log('[widget] tooltip actual:', require('./tray').summarizeTooltip(snapshot.providers || []));` dentro del callback `onUpdate` de `startUsagePolling` en `electron/main.js`, vuelve a correr `npm run electron:dev`, confirma en consola que el tooltip lista los proveedores reales con sus porcentajes/saldos, y revierte esta línea también.

- [ ] **Step 5: No hay commit en esta Task** (es solo verificación; ya está todo commiteado en Tasks anteriores).

---

### Task 14: Empaquetado con electron-builder

**Files:**
- Modify: `package.json` (bloque `"build"` de electron-builder)

**Interfaces:**
- Consumes: `build/standalone-bundle/` (Task 12), todo `electron/**` (Tasks 5-11).

- [ ] **Step 1: Añadir el bloque `build` a `package.json`**

```json
  "build": {
    "appId": "com.zambudio.dashboard-uso-apis",
    "productName": "Dashboard Uso APIs",
    "copyright": "Copyright (c) 2026 Pedro Zambudio",
    "directories": { "output": "dist" },
    "files": [
      "electron/**/*",
      "!electron/**/*.test.js"
    ],
    "extraResources": [
      { "from": "build/standalone-bundle", "to": "standalone-bundle" }
    ],
    "win": {
      "target": ["nsis", "portable"]
    },
    "portable": {
      "artifactName": "${productName}-${version}-portable.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "artifactName": "${productName}-${version}-Setup.${ext}"
    }
  },
```

No se especifica `icon` — sin un `.ico` de marca todavía, electron-builder usa el icono por defecto de Electron. Es un pendiente cosmético, no bloqueante (déjalo anotado en `Docs/PROJECT_STATUS.md` en la Task 15).

- [ ] **Step 2: Build rápido sin instalador (verifica que el empaquetado en sí funciona)**

Run: `npx electron-builder --win --dir`
Expected: termina sin errores y crea `dist/win-unpacked/Dashboard Uso APIs.exe`.

- [ ] **Step 3: Ejecutar el build sin empaquetar y comprobar arranque limpio**

Run (PowerShell):
```powershell
Start-Process "dist\win-unpacked\Dashboard Uso APIs.exe"
```
Espera unos segundos y verifica:
```powershell
Get-Process -Name "Dashboard Uso APIs" -ErrorAction SilentlyContinue
curl.exe -s http://127.0.0.1:3000/api/config
```
Expected: el proceso aparece corriendo y `/api/config` responde 200. Cierra la app desde el icono de bandeja (**Salir**) al terminar.

- [ ] **Step 4: Comprobar la instancia única**

Con la app del Step 3 todavía abierta, vuelve a lanzar `dist\win-unpacked\Dashboard Uso APIs.exe` una segunda vez.
Expected: no se abre una segunda ventana ni un segundo servidor — la ventana existente pasa a primer plano (comportamiento de `requestSingleInstanceLock`). Confirma con `Get-Process` que solo hay un árbol de procesos.

- [ ] **Step 5: Build final con instalador**

Run: `npm run electron:build`
Expected: termina sin errores y genera `dist/Dashboard Uso APIs-<version>-Setup.exe` y `dist/Dashboard Uso APIs-<version>-portable.exe`.

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "feat: configurar electron-builder para el instalador y la versión portable"
```

(El contenido generado en `dist/` se gestiona en la Task 16, junto con la retirada del empaquetado antiguo, para no dejar `dist/` en un estado mezclado con `dashboard.exe`/`DashboardTray.exe`.)

---

### Task 15: Retirar el empaquetado antiguo (pkg + WinForms)

**Files:**
- Modify: `package.json` (quitar script `"exe"`, dependencia `@yao-pkg/pkg`, bloque `"pkg"`)
- Delete: `scripts/build-exe.js`
- Delete: `scripts/tray-launcher.cs`
- Delete: `scripts/sign-exe.ps1` (firma pensada para `dashboard.exe`/`DashboardTray.exe`, ya no aplica — ver `Docs/SECURITY.md` en la Task 16 para dejar constancia de que la firma de código queda pendiente de rehacer para el nuevo exe)
- Modify: `.gitignore` (añadir `build/`, `dist/win-unpacked/`, `dist/*.blockmap`)
- Delete: contenido antiguo de `dist/` (`dashboard.exe`, `DashboardTray.exe`, `standalone/`, `.env_example` viejo) una vez confirmado que `npm run electron:build` (Task 14) ya deja `dist/` con los ejecutables nuevos

Solo se ejecuta esta Task después de que la Task 14 haya verificado con éxito el `.exe` empaquetado — así nunca hay una ventana de tiempo sin un paquete funcionando.

- [ ] **Step 1: Quitar el script y la dependencia de pkg de `package.json`**

Elimina la línea `"exe": "npm run build && node scripts/build-exe.js"` de `"scripts"`, elimina `"@yao-pkg/pkg": "^6.22.0"` de `"devDependencies"`, y elimina el bloque `"pkg": { "targets": [...], "outputPath": "dist" }` completo (ya no aplica; el nuevo `"build"` de electron-builder usa su propio `directories.output`).

Añade en su lugar, en `"scripts"`:
```json
    "exe": "npm run electron:build",
```

Run: `npm uninstall @yao-pkg/pkg`

- [ ] **Step 2: Borrar los scripts de empaquetado antiguos**

```bash
git rm scripts/build-exe.js scripts/tray-launcher.cs scripts/sign-exe.ps1
```

- [ ] **Step 3: Actualizar `.gitignore`**

Añade:
```
/build/
dist/win-unpacked/
dist/*.blockmap
```

- [ ] **Step 4: Regenerar `dist/` desde cero con el nuevo empaquetado**

```bash
git rm -r dist/
npm run build
npm run exe
```
Expected: `npm run exe` (ahora alias de `electron:build`) termina sin errores y deja en `dist/` únicamente: `Dashboard Uso APIs-<version>-Setup.exe`, `Dashboard Uso APIs-<version>-portable.exe` (y sus `.blockmap`, ya ignorados). Verifica con `git status` que ya no aparecen `dashboard.exe` ni `DashboardTray.exe` ni `standalone/` como borrados-pendientes-de-confirmar sin más — deben quedar efectivamente eliminados del árbol de trabajo.

- [ ] **Step 5: Repetir el smoke test del portable/instalador ya generado**

Run (PowerShell), ejecutando el instalador o el portable recién generado (ajusta el nombre exacto al que haya producido el Step 4):
```powershell
Start-Process "dist\Dashboard Uso APIs-0.1.0-portable.exe"
```
Expected: arranca igual que en la Task 14 (icono de bandeja, ventana del widget, `curl` a `/api/config` responde 200). Cierra la app desde **Salir** al terminar.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore dist/
git commit -m "chore: retirar empaquetado pkg+WinForms en favor de electron-builder"
```

---

### Task 16: Documentación

**Files:**
- Modify: `README.md`
- Modify: `Docs/PACKAGING.md`
- Modify: `Docs/ARCHITECTURE.md`
- Modify: `Docs/SECURITY.md`
- Modify: `Docs/PROJECT_STATUS.md`

**Interfaces:** ninguna — solo documentación, sin más pasos de código.

- [ ] **Step 1: `README.md`**

Sustituye la sección "Inicio rápido en cualquier PC Windows" y "Contenido obligatorio de `dist/`" para reflejar el nuevo flujo: copiar toda la carpeta `dist/` (ahora con `Dashboard Uso APIs-<version>-Setup.exe` o `...-portable.exe`), ejecutar el instalador o el portable, el widget flotante aparece automáticamiente junto al icono de bandeja único (ya no hay `DashboardTray.exe`/`dashboard.exe` separados). Actualiza también "Credenciales y migración" para explicar que las claves ahora se cifran con `safeStorage`/DPAPI en el almacén de datos de usuario de la app (`%APPDATA%\dashboard-uso-apis\credentials.enc` en dev, `%APPDATA%\Dashboard Uso APIs\credentials.enc` empaquetado) en vez de `dist/.env`, y que un `.env` anterior se importa automáticamente una vez.

- [ ] **Step 2: `Docs/PACKAGING.md`**

Sustituye las instrucciones de `npm run exe` (pkg + csc) por: `npm run build && npm run exe` (que ahora ejecuta `scripts/prepare-standalone.js` + `electron-builder --win`), documenta `scripts/prepare-standalone.js` como el equivalente al antiguo paso de copia de `build-exe.js`, y documenta el bloque `"build"` de electron-builder en `package.json`.

- [ ] **Step 3: `Docs/ARCHITECTURE.md`**

Añade una sección "Widget de escritorio (Electron)" describiendo: proceso principal Electron → spawnea servidor Next.js standalone (sin cambios respecto al resto del documento) → ventana flotante que recibe datos vía IPC desde un poller del proceso principal (nunca fetch directo del renderer, por CORS) → broker de credenciales HTTP en loopback como puente hacia `safeStorage`. Enlaza a `Docs/superpowers/specs/2026-08-11-electron-widget-design.md` para el razonamiento completo.

- [ ] **Step 4: `Docs/SECURITY.md`**

Actualiza la sección de credenciales: ya no es "Base64 sin cifrar", ahora es cifrado real vía `safeStorage` (DPAPI en Windows), con nota de que el cifrado está ligado a usuario/máquina (ya no es un `.env` portable copiable a otro PC sin más — hay que reconectar sesiones al migrar). Añade una nota sobre `scripts/sign-exe.ps1` retirado: la firma de código para el nuevo `.exe` de electron-builder queda como trabajo pendiente (antes ya se advertía "los binarios no tienen firma pública de código" en `Docs/PROJECT_STATUS.md`, así que no es una regresión, pero el mecanismo de firma concreto cambia y no se ha rehecho).

- [ ] **Step 5: `Docs/PROJECT_STATUS.md`**

Añade una entrada a "Cambios de la entrega actual" resumiendo este plan (widget Electron sustituye a WinForms+pkg, credenciales cifradas, tests unitarios nuevos con `node --test`), actualiza "Validaciones ejecutadas" con los resultados reales obtenidos en las Tasks 12-15 (arranque, instancia única, captura visual, build de instalador), y actualiza "Limitaciones conocidas": quita "No hay cifrado de secretos en reposo" (ya resuelto), añade "Sin firma de código para el nuevo instalador Electron" si aplica, y anota "Sin tests E2E de la interfaz —cobertura actual es solo de los módulos puros de `electron/lib` y `lib/cred-broker-client.js` vía `node --test`, más verificación manual con capturas de pantalla".

- [ ] **Step 6: Commit**

```bash
git add README.md Docs/PACKAGING.md Docs/ARCHITECTURE.md Docs/SECURITY.md Docs/PROJECT_STATUS.md
git commit -m "docs: documentar el widget de escritorio con Electron"
```

---

### Task 17: Verificación final completa

**Files:** ninguno — solo comandos de verificación.

- [ ] **Step 1: Suite de tests unitarios completa**

Run: `npm test`
Expected: PASS — todos los tests de `lib/cred-broker-client.test.js`, `electron/lib/credential-store.test.js`, `electron/credential-broker.test.js`, `electron/server-manager.test.js`, `electron/lib/tray-badge.test.js`, `electron/usage-poller.test.js`, `electron/tray.test.js` (33 tests en total; el número exacto puede variar si al ejecutarlas surge algún ajuste — lo importante es que ninguna falle).

- [ ] **Step 2: Lint y build de Next.js**

Run: `npm run lint && npm run build`
Expected: ambos sin errores.

- [ ] **Step 3: `npm run dev` sigue funcionando sin Electron**

Run: `npm run dev`, y en otra terminal: `curl -s http://127.0.0.1:3000/api/usage -X POST -H "Content-Type: application/json" -d "{}"`.
Expected: HTTP 400 `{"error":"missing id or provider"}` (confirma que el servidor responde con normalidad en modo navegador puro, sin ninguna variable de broker presente). Detén `npm run dev`.

- [ ] **Step 4: Smoke test final del ejecutable empaquetado**

Repite el Step 5 de la Task 15 (arrancar el `.exe` final desde `dist/`, comprobar bandeja + widget + `/api/config` + instancia única + Reiniciar servidor + Abrir en navegador + Salir).

- [ ] **Step 5: Revisión de `git status`**

Run: `git status`
Expected: sin cambios sin commitear salvo, como mucho, artefactos de build ya cubiertos por `.gitignore` (`build/`, `dist/win-unpacked/`). Todo el código fuente de las Tasks 1-16 debe estar ya commiteado.
