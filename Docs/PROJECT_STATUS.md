# Estado actual del proyecto

Última actualización: 12 de agosto de 2026.

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
- **Widget de escritorio (Electron)**, alternativa al dashboard web: ventana flotante con todos los proveedores (icono real de cada uno, barras de sesión/límite semanal, tiempo hasta el próximo reset cuando el proveedor lo expone), transparencia ajustable, temas de color, orden manual (mismo `cardOrder` que el dashboard web), visibilidad por proveedor independiente del dashboard web, icono de bandeja único, credenciales cifradas con `safeStorage`/DPAPI, instalador y versión portable (`electron-builder`). Convive con `DashboardTray.exe`/`dashboard.exe`, no los sustituye todavía (ver limitaciones).

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
13. Se investigó y corrigió con evidencia real (no suposiciones) por qué DeepSeek reportaba "sesión caducada" con una sesión válida: la condición de espera del scraper (`lib/usage/deepseek.server.ts`) comprobaba solo la etiqueta "Topped-up balance", que aparece antes de que el importe real termine de hidratar — se disparaba el scraping sobre una página a medio cargar. Corregido exigiendo un símbolo de moneda junto a la etiqueta. Se añadió además un reintento automático, persistencia de las cookies/`localStorage` refrescados tras cada consulta en vivo con éxito, y logging de diagnóstico no sensible.
14. Se encontró y corrigió un bug real y más serio, descubierto durante la investigación anterior: `lib/cred-broker-client.js` no marcaba su `fetch()` hacia el broker de credenciales con `cache: 'no-store'`. Al ejecutarse dentro de una ruta de Next.js, el `fetch` global cacheaba la primera lectura de `/credentials` para siempre en el proceso — cualquier escritura posterior (guardar una clave, refrescar la sesión de DeepSeek) nunca se reflejaba en una lectura posterior, y como el guardado de claves hace "lee todo + fusiona + escribe todo", podía revertir en silencio credenciales de otros proveedores guardadas más recientemente. Confirmado con una prueba de escritura/lectura directa contra el broker en ejecución antes y después del fix; test de regresión añadido.
15. Se añadió al widget: iconos reales de cada proveedor (`electron/renderer/logos/`, mismo mapeo que `ProviderLogo.tsx`), tiempo hasta el próximo reset por tarjeta, control de transparencia del panel (`preferences.widgetOpacity`) y visibilidad por proveedor específica del widget (`preferences.widgetHiddenProviderIds`), configurables desde el panel de ajustes del dashboard web.
16. (12 de agosto) El widget ganó barras de progreso de sesión/límite semanal (antes solo texto), respeta ahora `preferences.cardOrder` (el mismo orden manual del dashboard web, que antes ignoraba) y un selector de tema de color (`preferences.widgetTheme`, 5 temas). Se corrigió también `components/ProviderCard.tsx`: la fila de "sesión actual" se forzaba a mostrarse para Claude/Gemini aunque no hubiera datos reales (0%, sin fecha de reset); ahora solo aparece cuando hay datos de verdad, tanto en el dashboard web como en el widget.
17. (12 de agosto) Se corrigió `lib/usage/openai.server.ts`: una Project API Key normal (`sk-proj-...`) no tiene permiso para `usage/completions` ni `costs` (requieren una Admin API Key), pero esa llamada no estaba protegida con `try/catch` y su 403 se propagaba como error duro — la tarjeta no mostraba nada, ni siquiera el saldo, aunque la cuenta sí tuviera crédito. Ahora se intenta el saldo por separado contra el endpoint clásico de facturación (`dashboard/billing/credit_grants`, sin scope de admin) antes de tocar `usage/completions`/`costs`; cada llamada es independiente y solo se lanza un error duro si las tres fallan. No se pudo verificar en vivo contra una Project API Key real (solo se verificó la lógica y el tipado); el endpoint de saldo es el clásico "dashboard" de OpenAI y podría estar restringido para algunas cuentas — si sigue sin aparecer el saldo, revisar primero si ese endpoint responde 404/403 para la cuenta del usuario.

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
| `npm test` (`node --test`), entrega del 11/08 tarde | 34 tests, todos correctos (se añadió un test de regresión para el bug de caché del broker). |
| Fetch en vivo de DeepSeek tras el fix | Confirmado con la sesión real del usuario vía `POST /api/usage`: respuesta sin `error`, con coste/saldo reales, sin caer al snapshot en caché. |
| Persistencia tras refresco de DeepSeek | Confirmado: `cachedSnapshot.fetchedAt` en el almacén cifrado pasa a reflejar el momento del último scraping en vivo con éxito, en vez de quedarse congelado en el login original. |
| Bug de caché del broker de credenciales | Reproducido con una escritura/lectura directa contra `/api/keys` en ejecución (el valor escrito no aparecía en una lectura posterior); confirmado corregido tras aplicar `cache: 'no-store'`. |
| Consola del renderer del widget | Se añadió reenvío de `console-message` del widget a la consola del proceso principal (`widget-window.js`) y se usó para confirmar en vivo, contra la sesión real del usuario: opacidad aplicada, lista de proveedores ocultos respetada, icono correcto resuelto para los 5 proveedores y tiempo de reset calculado coincidiendo con los valores ya mostrados en el dashboard web. |
| Repaquetado final (`electron:build`) tras todos los cambios | Instalador y portable regenerados sin errores; mismo bloqueo ya documentado de Smart App Control al intentar el arranque directo en esta máquina (sin cambios respecto a la entrega anterior). |
| `npm test`, `tsc --noEmit`, `next lint`, `next build`, entrega del 12/08 | Todo correcto tras las barras de sesión/semanal, `cardOrder`, temas de color y el fix de saldo de OpenAI (34 tests, sin cambios en el número — este bloque no tiene tests unitarios propios todavía). |
| `cardOrder`/tema en el widget contra datos reales | Confirmado con `console-message` del renderer: al fijar `preferences.cardOrder`, el orden de las tarjetas del widget coincidió exactamente; al cambiar `preferences.widgetTheme`, `document.body.dataset.theme` reflejó el valor nuevo. |
| Fila de "sesión actual" oculta sin datos | Confirmado con datos reales: Anthropic (con sesión real, 79% semanal) mostró `hasSession: true`; Claude Pro (sin datos, error de organización) mostró `hasSession: false` — ya no se renderiza esa fila vacía. |
| Fix de saldo de OpenAI (`credit_grants`) | **No verificado contra una Project API Key real** — no se dispone de una para pruebas en este entorno. Verificado por revisión de código, tipado y que la ruta de fallo no rompe nada (si el endpoint de saldo también falla, el comportamiento es idéntico al anterior: error explicativo, sin datos inventados). Pendiente de confirmación con el usuario. |

## Estado operativo observado

- OpenAI/ChatGPT y Anthropic devolvieron porcentajes reales durante la validación.
- DeepSeek mostraba antes saldo/coste guardado con aviso de sesión web caducada por un bug de temporización del scraper, no por falta de sesión real; corregido el 11 de agosto de 2026 (tarde) — ver "Cambios de la entrega actual", punto 13.
- Claude Pro indicó que la sesión actual no encontraba organización.
- Este último es un estado de credencial y debe resolverse con **Iniciar sesión web**; no es un fallo de arranque.

## Limitaciones conocidas

- Hay tests unitarios (`node --test`, 34 pruebas) solo para los módulos puros de `electron/lib/` y `lib/cred-broker-client.js`; nada del resto del código (proveedores, parsers, componentes React, `lib/usage/deepseek.server.ts`) tiene cobertura, y no hay tests E2E. La corrección de DeepSeek se verificó end-to-end contra la cuenta real del usuario (no con un test automatizado) porque depende de estado de sesión real de un servicio de terceros.
- El scraping de DeepSeek sigue dependiendo de la estructura DOM actual de `platform.deepseek.com` y de que su capa anti-bot (AWS WAF) no cambie de comportamiento; el reintento y el logging de diagnóstico añadidos mitigan fallos puntuales pero no garantizan fiabilidad al 100% si DeepSeek cambia su interfaz o su protección.
- Las sesiones y endpoints internos pueden cambiar o expirar.
- Con `DashboardTray.exe`/`npm run dev`: no hay cifrado de secretos en reposo; Base64 no protege el contenido. Con el widget de Electron sí se cifran las claves de proveedor (`safeStorage`/DPAPI), pero no la configuración/preferencias no sensibles.
- Los binarios (ambas rutas) no tienen firma pública de código. Para el widget de Electron esto puede significar que **Smart App Control bloquee la ejecución por completo**, no solo un aviso de SmartScreen — comprobado durante el desarrollo (ver `Docs/SECURITY.md` y `Docs/PACKAGING.md`).
- **No se ha podido confirmar por ejecución directa que el `.exe` final del widget (instalador o portable) arranca correctamente** — solo se verificó exhaustivamente en modo `electron:dev` (mismo binario de Electron, mismo código, sin pasar por el paso de empaquetado de `electron-builder`). Por eso `DashboardTray.exe`/`dashboard.exe` no se han retirado.
- El lanzador de bandeja (`DashboardTray.exe`) espera el puerto 3000; el widget de Electron también usa el 3000 por defecto y no se ha probado su convivencia si ambos se ejecutan a la vez en el mismo PC.
- Desarrollo/build desde SMB/NAS no es fiable (confirmado de nuevo en esta entrega).
- No existe conversión de divisas para los totales.
- El proveedor `custom` no implementa consulta automática.
- El widget de Electron no tiene icono de aplicación propio (usa el de Electron por defecto) — pendiente cosmético.
- El fix de saldo de OpenAI usa el endpoint clásico `dashboard/billing/credit_grants` (no `/v1/`), que no es parte de la API pública documentada de OpenAI y podría estar restringido o retirado para algunas cuentas sin previo aviso. No se pudo verificar en vivo contra una Project API Key real; si el usuario sigue sin ver saldo tras este fix, comprobar primero si esa URL responde 403/404 para su cuenta.

## Próximos trabajos recomendados

1. Confirmar en un equipo con Smart App Control desactivado (o con la app ya aprobada) que el instalador/portable del widget arranca correctamente; solo entonces considerar retirar `DashboardTray.exe`/`dashboard.exe`.
2. Añadir tests unitarios de parsers y normalización de proveedores (`lib/usage/*.server.ts`), sin cobertura todavía.
3. Añadir smoke test del paquete y del ciclo iniciar/salir de la bandeja (ambas rutas).
4. Hacer configurable y verificable el puerto tanto del tray launcher como del widget de Electron, para poder ejecutar ambos a la vez sin conflicto.
5. Firmar releases con certificado reconocido (CA pública) y publicar checksums — la única forma real de evitar el bloqueo de Smart App Control.
6. Actualizar Next.js 14.2.15 a una versión corregida tras validar compatibilidad.
7. Añadir un icono de aplicación propio para el widget de Electron.
8. Cubrir con tests unitarios la lógica pura de `lib/usage/deepseek.server.ts` (parseo, decisión de reintento) inyectando un scraper falso, para no depender solo de verificación manual contra la cuenta real.
9. Confirmar con una Project API Key real de OpenAI si `dashboard/billing/credit_grants` responde correctamente; si OpenAI lo ha restringido para cuentas nuevas, buscar una alternativa (ej. permitir pegar directamente una Admin API Key adicional solo para lectura de saldo).

## Criterio de terminado

Un cambio no está terminado si modifica comportamiento, seguridad, instalación, arquitectura o empaquetado y deja desactualizados este documento, el README o el documento especializado correspondiente.
