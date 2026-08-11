# Arquitectura y flujos

## Visión general

Dashboard_Uso_APIs es una aplicación Next.js 14 App Router de una sola página. La interfaz corre principalmente en el cliente; las credenciales y las llamadas a proveedores pasan por rutas locales del servidor.

```mermaid
flowchart TD
    UI[app/page.tsx y components] --> STORAGE[lib/storage.ts]
    STORAGE --> CONFIG[/api/config]
    STORAGE --> KEYS[/api/keys]
    STORAGE --> USAGE[/api/usage]
    UI --> LOGIN[/api/auth/browser-login]
    CONFIG --> ENV[.env local]
    KEYS --> ENV
    USAGE --> FETCHERS[lib/usage/*.server.ts]
    LOGIN --> PLAYWRIGHT[Chromium interactivo]
    FETCHERS --> PROVIDERS[APIs y consolas oficiales]
    PLAYWRIGHT --> PROVIDERS
```

## Capas

| Capa | Archivos principales | Responsabilidad |
|---|---|---|
| Presentación | `app/page.tsx`, `components/` | Tarjetas, resúmenes, ajustes, orden manual y estados. |
| Modelo | `types/api.ts`, `lib/providers.ts` | Tipos y capacidades declaradas por proveedor. |
| Persistencia cliente | `lib/storage.ts` | Configuración y preferencias, consultando a la API local. |
| API local | `app/api/**/route.ts` | Configuración, credenciales, uso y sesiones de navegador. |
| Integraciones | `lib/usage/*.server.ts` | Consultas reales, normalización y errores por proveedor. |
| Automatización web | `lib/browser-login.server.ts` | Login interactivo, captura de sesión y snapshots. |
| Empaquetado | `launcher.js`, `server-entry.js`, `inspector-shim.js`, `scripts/` | Servidor standalone, compatibilidad pkg y bandeja Windows. |

## Arranque con bandeja

```mermaid
sequenceDiagram
    participant U as Usuario
    participant T as DashboardTray.exe
    participant L as dashboard.exe
    participant N as Next.js
    participant B as Navegador
    U->>T: Doble clic
    T->>T: Mutex de instancia única
    T->>L: Arranque oculto con DASHBOARD_NO_BROWSER=1
    L->>N: server-entry.js
    T->>N: Sondeo HTTP cada segundo
    N-->>T: HTTP 200
    T->>B: Abrir 127.0.0.1:3000 una vez
    T->>T: Icono verde
```

`DashboardTray.exe` es el propietario del proceso `dashboard.exe`. Al pulsar **Salir**, utiliza `taskkill /T` sobre ese proceso para cerrar también el servidor hijo. Si ya había un servidor externo en el puerto, el icono puede utilizarlo, pero no debe cerrar procesos que no haya iniciado.

## Carga y refresco de datos

1. `app/page.tsx` carga configuración visual y secreta combinando `/api/config` y `/api/keys` (ambos en `.env`).
2. Las integraciones configuradas se refrescan en paralelo con `POST /api/usage`.
4. Cada fetcher devuelve `ApiUsageSnapshot` con sólo los campos realmente disponibles.
4. Los snapshots visibles y preferencias se guardan en `.env` (vía `/api/config`), asegurando que las sesiones se mantengan independientemente del navegador o equipo usado.

## Inicio de sesión web

```mermaid
sequenceDiagram
    participant UI as BrowserLoginModal
    participant API as /api/auth/browser-login
    participant S as browser-login.server
    participant C as Chromium
    participant P as Proveedor
    UI->>API: POST action=start
    API->>S: Crear sesión (máximo 5 min)
    S->>C: Abrir ventana interactiva
    C->>P: Usuario inicia sesión
    UI->>API: GET estado cada 1 s
    S->>C: Detectar cookies, token, DOM o localStorage
    S->>S: Guardar secreto y snapshot en .env
    API-->>UI: completed + snapshot
    S->>C: Cerrar ventana
```

El mapa de sesiones vive en `globalThis.__browserLoginSessions` para sobrevivir a recargas de módulos del servidor. Cada sesión tiene temporizador de cinco minutos y limpieza posterior.

## Persistencia

| Ubicación | Contenido | Sensible |
|---|---|---|
| `.env` o `dist/.env` | Configuración completa: API keys bajo `DASHBOARD_PROVIDER_KEYS`, proveedores bajo `DASHBOARD_CONFIG`, y preferencias bajo `DASHBOARD_PREFERENCES`. Todo serializado en Base64. | Sí (claves y sesiones) |
| `localStorage: ai-api-dashboard-*` | Respaldo y migración local. Utilizado solo como fallback inicial. | No |

## Empaquetado

Next.js genera `output: 'standalone'`. `dashboard.exe` contiene el runtime Node de `pkg`, pero carga `standalone/server.js` desde disco. `server-entry.js` instala primero `inspector-shim.js` porque el runtime empaquetado no expone `inspector` y Next lo requiere para su trazador.

Playwright se copia completo dentro de `standalone/node_modules`. Su CLI se resuelve desde `process.cwd()`; no se usa `require.resolve('playwright')` porque Webpack lo convertiría en un identificador numérico del bundle.

## Widget de escritorio (Electron)

Vía alternativa a `DashboardTray.exe`, en `electron/`. No toca ninguna de las capas anteriores (proveedores, login web, rutas API) — solo cambia el *shell* que arranca el servidor y añade una interfaz nativa.

```mermaid
flowchart TD
    MAIN[electron/main.js] --> BROKER[credential-broker.js]
    MAIN --> SM[server-manager.js: spawnServer]
    SM --> SERVER[standalone/server.js]
    MAIN --> WIN[widget-window.js]
    MAIN --> TRAY[tray.js]
    MAIN --> POLL[usage-poller.js]
    POLL -->|fetch, no-store| SERVER
    WIN -->|IPC usage-update / server-status| RENDERER[renderer/widget.js]
    BROKER -->|HTTP loopback + token| ENVKEYS[lib/env-keys.server.ts]
    ENVKEYS -.->|sin broker: npm run dev| ENVFILE[.env]
```

- **`server-manager.js`** spawnea `standalone/server.js` con `ELECTRON_RUN_AS_NODE=1` (reutiliza el propio binario de Electron como runtime Node, sin depender de `pkg` ni de que el usuario tenga Node instalado). `waitForServer()` sondea `/api/config` (no `/`) porque en el standalone de Next, `/` está pre-renderizada y responde antes de que las rutas dinámicas terminen de inicializarse.
- **`credential-broker.js`** cifra `DASHBOARD_PROVIDER_KEYS` con `safeStorage` (DPAPI) en `credentials.enc`, dentro de `app.getPath('userData')`. Como el servidor Next.js sigue siendo un proceso Node aparte (no puede llamar a `safeStorage` directamente), expone un HTTP en loopback con un token aleatorio por arranque; `lib/env-keys.server.ts` habla con él si detecta `DASHBOARD_CRED_BROKER_URL`/`_TOKEN` en su entorno, y si no, sigue leyendo `.env` en Base64 exactamente igual que antes (así `npm run dev` sin Electron no cambia). `DASHBOARD_CONFIG` y `DASHBOARD_PREFERENCES` (no sensibles) siguen en `.env` sin pasar por el broker.
  - **`lib/cred-broker-client.js`** hace el `fetch()` real hacia el broker desde dentro de una ruta de Next.js (`app/api/keys/route.ts`) — con `cache: 'no-store'` obligatorio. Sin ese flag, el `fetch` global instrumentado por Next.js cachea la respuesta del `GET /credentials` en la primera lectura del proceso y la sirve congelada para siempre, sin importar cuántas veces se escriba después (bug real encontrado y corregido el 11 de agosto de 2026: cualquier ruta que primero "lee todo + fusiona + escribe todo" — como el guardado de una clave o el refresco de la sesión de DeepSeek — podía revertir en silencio cambios recientes de otros proveedores porque fusionaba contra esa foto congelada, no contra el estado real en disco).
- **`usage-poller.js`** hace todo el sondeo a `/api/config`/`/api/usage` desde el proceso principal, nunca desde el renderer: la ventana del widget se carga con `loadFile()` (origen `file://`), y un `fetch()` cross-origin desde ahí sería bloqueado por CORS. Usa `cache: 'no-store'` porque el `fetch()` del proceso principal de Electron pasa por la caché HTTP de Chromium, persistida en `userData/Cache` entre reinicios.
- **`widget-window.js`** / **`renderer/`** son la ventana flotante (sin bordes, siempre visible, colapsable) — reciben los datos por IPC (`usage-update`, `server-status`), nunca por `fetch()` directo. Cada tarjeta pinta el icono real del proveedor (`renderer/logos/`, mismo mapeo que `components/ProviderLogo.tsx`), el tiempo hasta el próximo reset si el proveedor lo expone (`usage.sessionResetsAt`/`weeklyResetsAt`), y la opacidad del panel se controla desde `preferences.widgetOpacity` (aplicado como `rgba()` en el `background` del `<body>`, no con `BrowserWindow.setOpacity()`, para que el texto siga siendo legible aunque el fondo sea muy transparente). `preferences.widgetHiddenProviderIds` filtra qué tarjetas se muestran, independiente del "Ocultar" del dashboard web.
- **`tray.js`** pinta un único icono de bandeja (color según el peor estado entre proveedores, mismos tonos que `ProviderCard.tsx`) con menú Mostrar widget / Abrir en navegador / Reiniciar servidor / Salir.

### Fiabilidad del scraping de DeepSeek (`lib/usage/deepseek.server.ts`)

DeepSeek no expone coste/tokens/peticiones por API pública; la única fuente es reabrir `platform.deepseek.com/usage` con la sesión guardada (cookies + `localStorage`, DeepSeek autentica su SPA con un token ahí, no con cookie propia) en un Chromium headless. Dos bugs reales causaban que se reportara "sesión caducada" con una sesión perfectamente válida:

1. La condición de espera (`page.waitForFunction`) comprobaba solo que apareciera la etiqueta "Topped-up balance" en el texto de la página. Esa etiqueta forma parte del esqueleto estático del SPA y aparece casi al instante, **antes** de que el importe real termine de hidratar (mientras tanto se ve "Profile" en vez del nombre de usuario real) — el scraping se disparaba sobre una página a medio cargar y siempre encontraba `undefined`. Ahora se exige un símbolo de moneda (`$`/`¥`/`€`) cerca de la etiqueta, señal real de que el valor ya se pintó.
2. Cada refresco en vivo con éxito ahora persiste las cookies/`localStorage` resultantes (`persistRefreshedSession`) en vez de depender para siempre de la sesión capturada en el login original — la plataforma va detrás de AWS WAF, que rota tokens en cada visita.

Además: un reintento automático (`scrapeLiveDeepSeekUsageWithRetry`) si el primer intento no encuentra datos, timeouts más generosos y `console.warn` de diagnóstico (sin secretos) en cada rama de fallo, para que un fallo futuro sea depurable desde los logs del proceso en vez de una caja negra.

Detalles de diseño y alternativas descartadas: [Docs/superpowers/specs/2026-08-11-electron-widget-design.md](./superpowers/specs/2026-08-11-electron-widget-design.md).
