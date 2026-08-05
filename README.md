# Dashboard_Uso_APIs

Dashboard (Next.js 14) para trackear uso/coste real de proveedores de API de IA (OpenAI, Anthropic, DeepSeek) y del % de uso de suscripciones Pro (Claude Pro). Todos los datos vienen de la API real de cada proveedor — nada es simulado.

## Uso rápido (usuario final)

1. Descarga/clona el repo.
2. Entra en la carpeta `dist/`.
3. Ejecuta `dashboard.exe`. Se abrirá `http://127.0.0.1:3000` en tu navegador.
4. Introduce tus claves desde la web (botón "Conectar" o "Configurar" en cada tarjeta). Se guardan automáticamente en un archivo `.env` que se crea **junto a `dashboard.exe`** (no en el repo, no se sube a git). Pulsa "Actualizar" en la tarjeta para consultar los datos reales.

Importante: `dashboard.exe` necesita `standalone/`, `server-entry.js` e `inspector-shim.js` a su lado (todo dentro de `dist/`). Si copias el exe a otro sitio, copia la carpeta `dist/` entera.

## Proveedores soportados y qué clave necesita cada uno

| Proveedor | Tipo | Qué guardar | Qué datos da la API pública |
|---|---|---|---|
| OpenAI | API de pago | **Admin API key** (`Organization Settings > Admin keys`, no la key normal de proyecto) | Tokens y coste de los últimos 7 días. Saldo no disponible. |
| Anthropic (API) | API de pago | **Admin API key** (`sk-ant-admin01-...`, Claude Console > Settings > Admin keys) | Tokens y coste de los últimos 7 días. Saldo y nº de peticiones no disponibles. |
| DeepSeek | API de pago | API key normal | Solo saldo. Coste/tokens/peticiones no están en su API pública (solo en su web). |
| Claude Pro | Suscripción | Cookie `sessionKey` de claude.ai (no es una API key) | % de uso de la sesión de 5h y de la semana, y cuándo resetean. |
| Google Gemini / Personalizado | — | API key | Guardado de la clave, sin consulta automática todavía. |

Ni ChatGPT Plus ni ninguna otra suscripción de consumo (aparte de Claude Pro) tienen forma de consultarse: no existe API pública, ni siquiera con login. Claude Pro es la excepción porque su propia web expone (sin documentar) los mismos endpoints internos que usa su interfaz — ver más abajo.

### Claude Pro: por qué es distinto y qué implica

No hay API pública para leer el % de uso de una suscripción Claude Pro. La única forma de verlo es la propia web de claude.ai. Este dashboard replica lo que hace [claude-usage-widget](https://github.com/SlavomirDurej/claude-usage-widget) (proyecto de referencia, código abierto):

1. Copias el valor de la cookie `sessionKey` de claude.ai (DevTools del navegador → Almacenamiento → Cookies) y la pegas en la tarjeta de Claude Pro.
2. El servidor arranca un Chromium headless (vía [Playwright](https://playwright.dev)), le inyecta esa cookie, y navega a los endpoints internos `claude.ai/api/organizations/{id}/usage` — los mismos que usa la web de Claude, no una API pública. Se necesita un navegador real (no una petición HTTP normal) porque Cloudflare bloquea peticiones sin motor de renderizado.
3. Devuelve `five_hour.utilization` / `seven_day.utilization` (uso de sesión y semanal) y sus `resets_at`.

**Ten en cuenta:**
- La cookie `sessionKey` da acceso completo a tu cuenta de claude.ai (no solo a las estadísticas) — es más sensible que una API key. Se guarda igual que las demás claves (`.env` local, base64, sin cifrar).
- Los endpoints usados no son públicos ni están documentados por Anthropic: pueden cambiar o dejar de funcionar sin aviso.
- Chromium pesa ~300 MB y no va empaquetado ni en el `.exe` ni en el repo (rompería un `git push` normal en GitHub, que rechaza archivos de más de 100 MB). Se descarga automáticamente, una sola vez, la primera vez que pulses "Actualizar" en la tarjeta de Claude Pro — necesita internet y puede tardar varios minutos.

### Aviso de seguridad de Windows

`dashboard.exe` no está firmado por una entidad de certificación reconocida (ver sección "Firma de código" más abajo). Puede que Windows lo bloquee al primer intento:

- **SmartScreen** ("Windows protegió su PC"): pulsa "Más información" → "Ejecutar de todos modos".
- **Smart App Control** (Windows 11, `Configuración > Privacidad y seguridad > Seguridad de Windows > Control de aplicaciones inteligente`): si está **Activado**, bloquea binarios sin firma reconocida sin dar opción de "ejecutar igualmente". Para poder ejecutar `dashboard.exe` en un equipo con esto activado hay que desactivar Smart App Control desde ese menú (ojo: es una acción del propio usuario, y una vez desactivado Windows no permite reactivarlo sin reinstalar el sistema).

## Cómo se guardan las claves

- El dashboard **no** usa `localStorage` para las claves de API (solo para preferencias no sensibles).
- Al guardar una clave desde la web, el frontend llama a `PUT /api/keys`, que el servidor escribe en un `.env` local como `DASHBOARD_PROVIDER_KEYS=<JSON id→clave codificado en base64>`.
- Al cargar la web, se llama a `GET /api/keys` para leer esas claves y rellenar el formulario.
- **Ojo:** es ofuscación (base64), no cifrado. El `.env` no debe compartirse ni subirse al repo (está en `.gitignore`).
- `.env_example` documenta la estructura para quien quiera crear el archivo a mano.
- Variable de entorno `DASHBOARD_ENV_FILE` permite apuntar a otra ruta de `.env` si hiciera falta (por defecto: junto al ejecutable).

## Desarrollo

```
npm install
npm run dev      # http://localhost:3000, usa .env en la raíz del repo
npm run build    # build de producción (next build, output standalone)
npm run start    # sirve el build (sin empaquetar)
npm run lint
```

## Generar el `.exe`

```
npm run exe
```

Esto ejecuta `next build` y luego `scripts/build-exe.js`, que:

1. Copia `.next/standalone` a `dist/standalone/` (incluyendo `.next/static` y `public/`, que `next build` con `output: 'standalone'` no copia solo).
2. Copia el paquete completo de `playwright`/`playwright-core` sobre el `node_modules` del standalone (el tracing automático de Next solo sigue imports estáticos y se deja fuera `playwright/cli.js`, referenciado en runtime como string — sin él no se puede autoinstalar Chromium).
3. Empaqueta **únicamente** `launcher.js` con `pkg` → `dist/dashboard.exe` (~55 MB, es el runtime de Node incrustado).
4. Copia `.env_example`, `inspector-shim.js` y `server-entry.js` a `dist/`.

### Por qué el exe no lleva el build de Next dentro

El primer intento intentó incrustar todo el build (incluido `.next/`) dentro del snapshot de `pkg`. `@yao-pkg/pkg` 6.22 no respeta bien el glob de `pkg.assets` para árboles de ficheros grandes con muchos ficheros generados por Next (rutas `.next/BUILD_ID`, chunks, etc.), y el resultado fallaba al arrancar ("File ... was not included into executable").

En vez de pelear con eso, `dashboard.exe` empaqueta solo `launcher.js` (sin dependencias dinámicas de ficheros) y el build de Next se distribuye como **carpeta normal** (`dist/standalone/`) al lado del exe. Al arrancar, `launcher.js`:

1. Detecta la carpeta donde está el propio exe (`process.pkg` + `process.execPath`).
2. Lanza `standalone/server.js` como proceso hijo, reutilizando el runtime de Node embebido en el exe (truco `PKG_EXECPATH=PKG_INVOKE_NODEJS`, documentado por pkg para invocar el binario empaquetado como `node <script>` normal sobre un fichero externo).
3. Le pasa `DASHBOARD_ENV_FILE` apuntando al `.env` junto al exe, y `PORT`/`HOSTNAME`.
4. Espera a que el servidor responda y abre el navegador.

Esto evita los problemas de asset-embedding: los ficheros de Next son ficheros normales en disco, no un snapshot virtual.

### `ERR_INSPECTOR_NOT_AVAILABLE`: el Node de pkg no tiene el módulo `inspector`

El runtime de Node que `pkg` incrusta en el exe se compila **sin soporte de `inspector`**. Next.js instrumenta automáticamente cualquier `fetch()` del lado servidor (usado por `/api/usage` para llamar a las APIs de los proveedores) y esa instrumentación hace `require('inspector')` sin condición nada más cargarse — no hay forma de desactivarlo por variable de entorno, porque el `require` ocurre antes de que se pueda comprobar ningún flag.

El arreglo normal sería precargar un shim con `node --require shim.js`, pero el runtime de `pkg` tampoco soporta `--require` ni `NODE_OPTIONS` (lanza `ERR_INTERNAL_ASSERTION: --require is not supported`). La solución que queda, y la que usa este proyecto:

- `inspector-shim.js` — parchea `Module._load` para devolver un stub inofensivo cuando algo pide `require('inspector')`.
- `server-entry.js` — punto de entrada real que lanza `launcher.js`: primero `require('./inspector-shim.js')`, luego `require('./standalone/server.js')`, en el mismo proceso y en ese orden, para que el parche esté aplicado antes de que Next intente cargar `inspector`.

Si en algún momento se cambia qué fichero arranca el servidor, hay que mantener este orden de carga o volverá el crash.

### Firma de código

`dashboard.exe` se genera sin firmar. Hay un script de ayuda para firmarlo con un certificado **autofirmado**:

```
powershell -ExecutionPolicy Bypass -File scripts\sign-exe.ps1
```

Esto añade una firma Authenticode válida (integridad verificable) pero **no elimina los avisos de Windows para terceros**: un certificado autofirmado no tiene reputación en la nube de Microsoft, así que SmartScreen y Smart App Control lo siguen tratando como no confiable en cualquier PC que no haya instalado tu certificado manualmente.

Para distribuir sin avisos a cualquier usuario, se necesita un certificado de una CA reconocida:

- **[SignPath.io](https://signpath.io)** — firma gratuita para proyectos open-source (requiere solicitud/revisión y repo público).
- **CA de pago** (Sectigo, DigiCert, SSL.com...) — certificados OV desde ~70-150 €/año, EV algo más caros pero con reputación instantánea en SmartScreen. Requieren verificación de identidad/empresa.

Ninguna de las dos opciones se puede completar de forma automática: requieren datos personales/de empresa y pago que solo el propietario del proyecto puede aportar.

## Estado actual / pendiente

Verificado funcionando de extremo a extremo (incluido el `.exe` empaquetado real): guardado/lectura de claves en `.env`, saldo real de DeepSeek, y arranque del servidor sin el crash de `inspector`.

**Pendiente de diagnosticar:** en la última sesión, al probarlo en el navegador con credenciales reales (DeepSeek + cookie de Claude Pro) el usuario reportó que "no funciona bien" sin más detalle — no se llegó a capturar qué falla exactamente (¿la UI, un proveedor concreto, la descarga de Chromium, algo visual?). Antes de tocar código en la próxima sesión, pedir: qué tarjeta/proveedor falla, qué mensaje de error aparece (si aparece), y si es un problema visual o de datos.

## Arquitectura

Ver [`AGENTS.md`](./AGENTS.md).
