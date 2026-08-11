# Widget de escritorio con Electron — diseño

Fecha: 11 de agosto de 2026.

## Contexto y objetivo

El proyecto es hoy un dashboard Next.js empaquetado con `@yao-pkg/pkg` (`dashboard.exe`) y un lanzador de bandeja en C#/WinForms (`DashboardTray.exe`) que se limita a arrancar el servidor y abrir una pestaña del navegador en `http://127.0.0.1:3000`. No existe ninguna ventana nativa con datos en vivo.

El usuario compartió como referencia [claude-usage-widget](https://github.com/SlavomirDurej/claude-usage-widget) (copiado localmente en `claude-usage-widget-main/claude-usage-widget-main/`), una app Electron que muestra el uso de una cuenta de Claude en una ventana flotante compacta + iconos de bandeja, con la sesión cifrada vía `safeStorage` (DPAPI/keychain del SO) y login mediante una `BrowserWindow` real.

Objetivo: convertir este proyecto en un widget de escritorio nativo equivalente, pero para **todos los proveedores configurados** (OpenAI, Anthropic, Gemini, DeepSeek, custom), manteniendo también la posibilidad de usarlo como página web — con preferencia clara por el widget.

## Alcance

**Dentro de alcance:**
- Nuevo shell Electron que arranca el servidor Next.js existente y añade una ventana flotante + bandeja del sistema.
- Migración de credenciales de `.env`/Base64 a almacenamiento cifrado con `safeStorage`.
- Sustitución del empaquetado actual (`pkg` + WinForms) por `electron-builder`.
- Actualización de la documentación (`README.md`, `Docs/`) afectada por el cambio de shell y de formato de `dist/`.

**Fuera de alcance (deliberadamente, para no arriesgar trabajo recién estabilizado):**
- Lógica de scraping/consulta por proveedor (`lib/usage/*.server.ts`).
- Flujo de login interactivo con Playwright (`/api/auth/browser-login`, `BrowserLoginModal.tsx`).
- Formato de `ApiUsageSnapshot` / `ApiProviderConfig` / `DashboardPreferences`.
- Soporte multiplataforma (macOS/Linux) — igual que hoy, el objetivo es Windows.

## Arquitectura

```
Electron (proceso principal, Node)
 ├─ Arranca el servidor Next.js standalone como proceso hijo
 │  (server-entry.js, misma lógica de espera de puerto que hoy;
 │  sin cambios en el código del servidor)
 ├─ Ventana del widget (BrowserWindow sin bordes, always-on-top)
 │  → vista compacta que consulta http://127.0.0.1:3000/api/usage
 ├─ Icono de bandeja (uno solo) con menú:
 │  Mostrar widget / Abrir en navegador / Reiniciar servidor / Salir
 └─ Almacén de credenciales cifrado (safeStorage/DPAPI)
    accesible al servidor Next.js vía un canal local autenticado
```

Todo lo que hoy vive en `lib/usage/*.server.ts`, las rutas `app/api/*` y el login con Playwright se reutiliza sin cambios. Electron sustituye únicamente a `DashboardTray.exe` + `dashboard.exe` como shell de arranque, y añade la ventana flotante.

El servidor sigue escuchando en `127.0.0.1:3000`: "Abrir en navegador" desde la bandeja (o entrar manualmente a esa URL) da acceso al dashboard web completo tal cual existe hoy. El widget es una vista adicional, no un reemplazo — cumpliendo el requisito de que funcione "de las dos maneras".

## Ventana del widget

- **Ventana**: sin bordes (`frame: false`), `alwaysOnTop`, transparente, tamaño ajustable según el número de tarjetas visibles. Posición y estado (anclado/oculto) se persisten y se restauran al reabrir, igual que hace el proyecto de referencia con `windowPosition`.
- **Contenido**: versión compacta de `ProviderCard.tsx` — nombre, barra de uso/porcentaje o saldo según el tipo de proveedor (`api` → coste/tokens, `subscription` → % sesión/semanal), estado (`online`/`warning`/`offline`/`error`), respetando `visibility` y `cardOrder` de las preferencias actuales. Un proveedor sin sesión muestra "sin sesión", nunca datos inventados — mismo criterio que ya sigue el proyecto.
- **Interacción**:
  - Clic en una tarjeta abre esa integración en el dashboard completo (navegador) para reconectar o ajustar.
  - Botón "Dashboard completo" abre `127.0.0.1:3000`.
  - Botón para colapsar/expandir la ventana.
  - Ventana arrastrable para reposicionar.
- **Refresco**: polling a `/api/usage` con intervalo configurable — nueva preferencia `refreshWidgetSeconds` en `DashboardPreferences`, con valor por defecto de 300s.
- **Bandeja**: un único icono (no uno por proveedor, dado que puede haber 5+), tooltip con el resumen de todos los proveedores, y color de aviso (rojo/ámbar) si alguno supera el umbral configurado — coherente con los colores que ya usa `ProviderCard`.

## Credenciales y login

- **Login**: sin cambios. Se mantiene el flujo actual con Playwright (`/api/auth/browser-login`), ya probado y usado por proveedores delicados (DeepSeek, Claude Pro).
- **Estado actual de persistencia**: todo vive en una única variable `DASHBOARD_PROVIDER_KEYS` dentro de `.env`, codificada en Base64 (reversible, sin cifrado real), leída/escrita directamente por el servidor Next.js vía `lib/env-keys.server.ts`.
- **Problema**: `safeStorage` solo existe dentro de un proceso Electron; el servidor Next.js sigue siendo un proceso Node hijo aparte y no puede llamarlo directamente.
- **Diseño**:
  - Electron (proceso principal) pasa a ser el único que lee/escribe el fichero cifrado (`credentials.enc`, cifrado con `safeStorage`/DPAPI) en su carpeta de datos de usuario (`app.getPath('userData')`).
  - `lib/env-keys.server.ts` deja de tocar el disco directamente: llama por HTTP a un endpoint en loopback (`127.0.0.1:<puerto-credenciales>`) que expone Electron, protegido con un token aleatorio generado en cada arranque y pasado al servidor por variable de entorno (`DASHBOARD_CRED_BROKER_URL`, `DASHBOARD_CRED_BROKER_TOKEN`). Se elige HTTP en vez de IPC nativo porque Electron y el servidor Next.js son procesos Node completamente independientes (el segundo se sigue spawneando como hoy), y HTTP es el mecanismo que ya usa el resto del proyecto entre procesos.
  - **Modo desarrollo** (`npm run dev` sin Electron): sigue funcionando igual que hoy, leyendo/escribiendo `.env` en Base64. Al no existir el token de Electron en ese contexto, `env-keys.server.ts` cae automáticamente al camino de fichero actual — no rompe el flujo de desarrollo.
  - **Migración**: al primer arranque de la versión Electron, si existe un `.env` antiguo con `DASHBOARD_PROVIDER_KEYS`, se importa una vez al almacén cifrado. Se documenta que, a partir de ese momento, ya no es un fichero portable sin más entre PCs (cifrado ligado a usuario/máquina) — hay que reconectar sesiones al migrar, igual que ya se advierte hoy para sesiones caducadas.

## Empaquetado, arranque y errores

- **electron-builder** sustituye a `@yao-pkg/pkg` + compilación C#: un único target Windows (`nsis` + `portable`), generando `Dashboard-Widget.exe` en `dist/`. Se retiran `scripts/build-exe.js`, `scripts/tray-launcher.cs` y el paso de compilación C#.
- **Instancia única**: se sustituye el probing manual de puerto de `launcher.js` por `app.requestSingleInstanceLock()` de Electron.
- **Arranque**: Electron spawnea el servidor standalone igual que hoy (`server-entry.js`), espera con la misma lógica de `waitForServer`, y en vez de abrir el navegador automáticamente crea la ventana del widget. El usuario abre la web manualmente desde el menú si la quiere.
- **Servidor caído/reiniciado**: si el proceso hijo muere, el widget lo detecta por fallo de polling y muestra un estado "servidor no responde" en vez de datos obsoletos, con opción "Reiniciar servidor" desde la bandeja (ya existente hoy en `DashboardTray.exe`).
- **Documentación**: cambia el contenido esperado de `dist/` (ya no hay `DashboardTray.exe`/`dashboard.exe`, sino un único exe de Electron). Hay que actualizar `README.md` y los documentos afectados en `Docs/` (`PACKAGING.md`, `ARCHITECTURE.md`, `SECURITY.md`, `PROJECT_STATUS.md`) — entra dentro del criterio de "terminado" que ya sigue el proyecto.

## Testing

- Verificación manual del widget: arranque, refresco de tarjetas, colapso/expansión, arrastre y persistencia de posición, "Abrir en navegador", "Reiniciar servidor", cierre y reapertura.
- Verificación de la migración de credenciales: `.env` antiguo con claves existentes se importa correctamente una sola vez al almacén cifrado.
- Verificación de que `npm run dev` (sin Electron) sigue funcionando con el fallback a `.env`.
- `npm run lint` y `next build` deben seguir pasando sin cambios en el código del servidor/proveedores.
- Empaquetado: generación del exe con `electron-builder`, arranque en un PC limpio (sin Node instalado), comprobación de instancia única.
