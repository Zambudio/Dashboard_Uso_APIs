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

## Cambios de la entrega actual

1. Se diagnosticó que `next dev` no era fiable desde la unidad NAS por errores Watchpack/SMB y bloqueos de `.next`.
2. Se recompiló el código actual en una ruta local NTFS.
3. Se corrigió la resolución de `playwright/cli.js`: Next convertía `require.resolve('playwright')` en el id numérico `6681`.
4. Se restauró el `.env` operativo del paquete y se verificaron datos reales.
5. Se añadió `DashboardTray.exe` para ocultar consola y mantener la aplicación en la bandeja.
6. Se añadió `DASHBOARD_NO_BROWSER=1` y se protegieron callbacks de sondeo para evitar aperturas duplicadas.
7. Se creó la carpeta `Docs/` y se actualizaron README, AGENTS y contexto de continuación.
8. Se movió la persistencia de UI (proveedores y preferencias) a `.env` usando una nueva ruta `/api/config` para que las sesiones y ajustes permanezcan al cambiar de navegador.

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

## Estado operativo observado

- OpenAI/ChatGPT y Anthropic devolvieron porcentajes reales durante la validación.
- DeepSeek pudo mostrar saldo/coste guardado y avisó de sesión web caducada.
- Claude Pro indicó que la sesión actual no encontraba organización.
- Estos dos últimos son estados de credencial y deben resolverse con **Iniciar sesión web**; no son fallos de arranque.

## Limitaciones conocidas

- No hay tests unitarios/E2E versionados.
- Las sesiones y endpoints internos pueden cambiar o expirar.
- No hay cifrado de secretos en reposo; Base64 no protege el contenido.
- Los binarios no tienen firma pública de código.
- El lanzador de bandeja espera el puerto 3000.
- Desarrollo/build desde SMB/NAS no es fiable.
- No existe conversión de divisas para los totales.
- El proveedor `custom` no implementa consulta automática.

## Próximos trabajos recomendados

1. Añadir tests unitarios de parsers y normalización.
2. Añadir smoke test del paquete y del ciclo iniciar/salir de la bandeja.
3. Diseñar almacenamiento cifrado con Windows Credential Manager o DPAPI.
4. Hacer configurable y verificable el puerto del tray launcher.
5. Firmar releases con certificado reconocido y publicar checksums.
6. Actualizar Next.js 14.2.15 a una versión corregida tras validar compatibilidad.

## Criterio de terminado

Un cambio no está terminado si modifica comportamiento, seguridad, instalación, arquitectura o empaquetado y deja desactualizados este documento, el README o el documento especializado correspondiente.
