# Estado actual del proyecto

Última actualización: 11 de agosto de 2026.

## Implementado

- Dashboard Next.js 14 en español con cinco integraciones estándar y proveedores personalizados.
- Persistencia sensible y configuración de interfaz movida a `.env` vía backend `/api/config` para compartir sesión al 100% entre navegadores, desvinculándola de `localStorage`.
- Consultas reales de OpenAI, Anthropic, Claude, Gemini y DeepSeek según las capacidades de cada fuente.
- Login web interactivo con Playwright, polling, cancelación y timeout de cinco minutos.
- Preferencias, tarjetas ocultas, orden manual y resumen global guardados persistentemente.
- Build standalone y `dashboard.exe` para Windows x64.
- `DashboardTray.exe` WinForms sin consola, con instancia única, estado visual, abrir, reiniciar y salir.
- Descarga bajo demanda de Chromium.
- Documentación de usuario, arquitectura, API, proveedores, seguridad, desarrollo, empaquetado y operación.
- **Widget de escritorio (Electron)**, alternativa al dashboard web: ventana flotante con todos los proveedores, icono de bandeja único, credenciales cifradas con `safeStorage`/DPAPI, instalador y versión portable (`electron-builder`). Convive con `DashboardTray.exe`/`dashboard.exe`, no los sustituye todavía (ver limitaciones).

## Cambios de la entrega actual

1. Se diagnosticó que `next dev` no era fiable desde la unidad NAS por errores Watchpack/SMB y bloqueos de `.next`.
2. Se recompiló el código actual en una ruta local NTFS.
3. Se corrigió la resolución de `playwright/cli.js`: Next convertía `require.resolve('playwright')` en el id numérico `6681`.
4. Se restauró el `.env` operativo del paquete y se verificaron datos reales.
5. Se añadió `DashboardTray.exe` para ocultar consola y mantener la aplicación en la bandeja.
6. Se añadió `DASHBOARD_NO_BROWSER=1` y se protegieron callbacks de sondeo para evitar aperturas duplicadas.
7. Se creó la carpeta `Docs/` y se actualizaron README, AGENTS y contexto de continuación.
8. Se movió la persistencia de UI (proveedores y preferencias) a `.env` usando una nueva ruta `/api/config` para que las sesiones y ajustes permanezcan al cambiar de navegador.
9. Se añadió el widget de escritorio con Electron (`electron/`): ventana flotante, bandeja única, broker de credenciales cifradas (`safeStorage`/DPAPI) y `electron-builder` para el instalador/portable. Diseño en `Docs/superpowers/specs/2026-08-11-electron-widget-design.md`, plan en `Docs/superpowers/plans/2026-08-11-electron-widget.md`.
10. Se corrigieron dos bugs de tipos heredados de una sesión previa sin commitear (`PollStatusResponse.secret` faltante en `BrowserLoginModal.tsx`, que rompía `next build`) al traer ese trabajo a este branch.
11. Se corrigió que `next build` arrastraba `electron`/`electron-store` (~350MB) al standalone del servidor sin que ningún route handler los usara (`next.config.js`, `outputFileTracingExcludes`).
12. El desarrollo/build volvió a bloquearse en la unidad NAS (mismo síntoma que el punto 1); se replicó el repositorio a una ruta NTFS local (`C:\ClaudeWork\Dashboard_Uso_APIs`) para todo el trabajo de Electron/build, sincronizando los commits de vuelta al repositorio original al terminar.

## Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `npm run lint` | Correcto, sin warnings ni errores. |
| `next build` + comprobación de tipos | Correcto. |
| `npm run exe` | Generó ambos ejecutables. |
| Compilación C# WinForms | Correcta. |
| `node --check` en scripts JS | Correcto. |
| `git diff --check` | Correcto. |
| Arranque mediante bandeja | Una instancia, sin ventana, responde. |
| Servidor | HTTP 200 en `127.0.0.1:3000`. |
| UI | Página, datos reales y panel de ajustes comprobados. |
| `npm test` (`node --test`) | 33 tests, todos correctos (broker de credenciales, almacén cifrado, gestor del servidor, color de bandeja, poller). |
| `npm run electron:dev` | Arranque completo, instancia única, broker de credenciales, servidor Next.js. |
| Migración de credenciales heredadas | Las 5 claves/cookies del `.env` real de la máquina de desarrollo migraron correctamente al almacén cifrado vía el broker. |
| Cifrado de `credentials.enc` | Confirmado por prefijo DPAPI `v10` en los bytes crudos del fichero (no es JSON/Base64 legible). |
| Widget con datos reales | Capturas de pantalla confirmando tarjetas con datos reales de los 5 proveedores, incluidos errores reales (sesión de DeepSeek caducada) sin inventar datos. |
| Detección de caída del servidor | Confirmada matando el proceso hijo de Next.js directamente; el widget/bandeja reflejan el estado. |
| `npx electron-builder --win --dir` y `npm run electron:build` | Generan el paquete sin errores; instalador y portable (~145MB cada uno). |
| Arranque del `.exe` final empaquetado | **No confirmado** en la máquina de desarrollo — bloqueado por Smart App Control de Windows (ver limitaciones). |

## Estado operativo observado

- OpenAI/ChatGPT y Anthropic devolvieron porcentajes reales durante la validación.
- DeepSeek pudo mostrar saldo/coste guardado y avisó de sesión web caducada.
- Claude Pro indicó que la sesión actual no encontraba organización.
- Estos dos últimos son estados de credencial y deben resolverse con **Iniciar sesión web**; no son fallos de arranque.

## Limitaciones conocidas

- Hay tests unitarios (`node --test`, 33 pruebas) solo para los módulos puros de `electron/lib/` y `lib/cred-broker-client.js`; nada del resto del código (proveedores, parsers, componentes React) tiene cobertura, y no hay tests E2E.
- Las sesiones y endpoints internos pueden cambiar o expirar.
- Con `DashboardTray.exe`/`npm run dev`: no hay cifrado de secretos en reposo; Base64 no protege el contenido. Con el widget de Electron sí se cifran las claves de proveedor (`safeStorage`/DPAPI), pero no la configuración/preferencias no sensibles.
- Los binarios (ambas rutas) no tienen firma pública de código. Para el widget de Electron esto puede significar que **Smart App Control bloquee la ejecución por completo**, no solo un aviso de SmartScreen — comprobado durante el desarrollo (ver `Docs/SECURITY.md` y `Docs/PACKAGING.md`).
- **No se ha podido confirmar por ejecución directa que el `.exe` final del widget (instalador o portable) arranca correctamente** — solo se verificó exhaustivamente en modo `electron:dev` (mismo binario de Electron, mismo código, sin pasar por el paso de empaquetado de `electron-builder`). Por eso `DashboardTray.exe`/`dashboard.exe` no se han retirado.
- El lanzador de bandeja (`DashboardTray.exe`) espera el puerto 3000; el widget de Electron también usa el 3000 por defecto y no se ha probado su convivencia si ambos se ejecutan a la vez en el mismo PC.
- Desarrollo/build desde SMB/NAS no es fiable (confirmado de nuevo en esta entrega).
- No existe conversión de divisas para los totales.
- El proveedor `custom` no implementa consulta automática.
- El widget de Electron no tiene icono de aplicación propio (usa el de Electron por defecto) — pendiente cosmético.

## Próximos trabajos recomendados

1. Confirmar en un equipo con Smart App Control desactivado (o con la app ya aprobada) que el instalador/portable del widget arranca correctamente; solo entonces considerar retirar `DashboardTray.exe`/`dashboard.exe`.
2. Añadir tests unitarios de parsers y normalización de proveedores (`lib/usage/*.server.ts`), sin cobertura todavía.
3. Añadir smoke test del paquete y del ciclo iniciar/salir de la bandeja (ambas rutas).
4. Hacer configurable y verificable el puerto tanto del tray launcher como del widget de Electron, para poder ejecutar ambos a la vez sin conflicto.
5. Firmar releases con certificado reconocido (CA pública) y publicar checksums — la única forma real de evitar el bloqueo de Smart App Control.
6. Actualizar Next.js 14.2.15 a una versión corregida tras validar compatibilidad.
7. Añadir un icono de aplicación propio para el widget de Electron.

## Criterio de terminado

Un cambio no está terminado si modifica comportamiento, seguridad, instalación, arquitectura o empaquetado y deja desactualizados este documento, el README o el documento especializado correspondiente.
