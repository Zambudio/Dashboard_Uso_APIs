# Estado del proyecto

## Versión en preparación

`0.2.1` — corrección de recuperación del widget en configuraciones multimonitor.

## Implementado

- Widget Electron, bandeja, instancia única y servidor Next.js standalone.
- Panel de configuración integrado: tema, opacidad, intervalo, inicio con Windows, siempre visible y proveedores visibles.
- Credenciales cifradas con DPAPI y fallo seguro sin cifrado.
- Separación entre credenciales y configuración no sensible.
- El renderer solo recibe presencia de credencial, nunca su contenido.
- Eliminación de `localStorage` como respaldo de configuración.
- Login web con contextos efímeros, sin perfil persistente en disco.
- Migración única desde `.env` heredado al almacén cifrado de Electron.
- Next.js 16.3, React 19.2, Electron 43.4, TypeScript 5.9 y ESLint 9.39.
- CI, Dependabot, licencia MIT, guía de contribución y política de seguridad.
- Actions actualizadas y Dependabot limitado a cambios compatibles; los saltos mayores requieren migración planificada.
- Workflow de release Windows que exige firma válida y publica SHA-256.
- `dist/`, ejecutables, runtime y diagnósticos locales excluidos de Git.
- Historial Git saneado: `dist/` eliminado de todas las revisiones y procedimiento documentado.
- Empaquetado sin duplicar Next, React y Playwright entre `app.asar` y el bundle standalone.
- Fuses de Electron endurecidos y servidor migrado de `runAsNode` a `utilityProcess`.
- Empaquetado antiguo `pkg` + tray C# retirado; `npm run exe` es alias de Electron Builder.
- Navegador de producción resuelto mediante Edge/Chrome sin reactivar `runAsNode`.
- Staging NTFS compatible con borrados pendientes del árbol de trabajo.
- Recuperación desde bandeja: restaura ventanas minimizadas y las trae al monitor activo.

## Validación de esta entrega

| Comprobación | Estado |
|---|---|
| ESLint 9 | Correcto |
| TypeScript estricto y sin caché incremental | Correcto |
| Tests unitarios dirigidos | 47/47 correctos |
| Auditoría del lockfile actualizado | 0 vulnerabilidades |
| `npm run check` con dependencias nuevas | Correcto en copia NTFS limpia |
| `npm run build` con Next.js 16 | Correcto en copia NTFS limpia |
| Paquete Electron `0.2.1` | Setup (110.980.948 bytes) y portable (110.760.505 bytes) generados desde NTFS |
| Arranque del paquete previo al sellado de fuses | HTTP 200 en `127.0.0.1:31873` con perfil aislado |
| Arranque del paquete final endurecido `0.2.0` | Instalado; servidor HTTP 200, tray y sondeo de proveedores correctos |
| Configuración de fuses del EXE final | Verificada con `@electron/fuses read` |
| Navegador del sistema | Microsoft Edge 151 iniciado correctamente mediante Playwright |
| `electron:dev` invocado desde NAS | Correcto mediante staging NTFS; HTTP 200 en `127.0.0.1:32123` |
| Firma de los artefactos `0.2.1` locales | `NotSigned`; requieren certificado del mantenedor antes de distribuir |
| Recuperación visual `0.2.1` | Caso real reproducido y corregido; nueva instalación pendiente de prueba manual |

## Limitaciones reales

- Los endpoints internos, cookies y medidas anti-bot de los proveedores pueden cambiar.
- OpenAI puede bloquear el login automatizado con Cloudflare; no se intenta conservar un perfil persistente para sortearlo.
- DeepSeek requiere rehidratar el estado web capturado para consultar métricas que no ofrece su API pública.
- No existe conversión de divisas.
- El proveedor `custom` no consulta uso automáticamente.
- Una build local sin certificado seguirá pudiendo activar SmartScreen/EDR. El código no puede sustituir la reputación y firma del editor.
- Los artefactos locales `0.1.0`, `dashboard.exe` y `DashboardTray.exe` están retirados y no deben distribuirse.

## Criterio de terminado

No presentar como release lista una build que no haya pasado `npm run check`, `npm run build`, empaquetado, validación de firma y prueba de arranque. La documentación debe distinguir siempre lo validado de lo pendiente.
