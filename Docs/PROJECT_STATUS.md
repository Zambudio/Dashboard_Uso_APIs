# Estado del proyecto

## Línea base de cierre

`0.2.2` — corrección de carga del renderer del widget en el paquete endurecido.

Estado: **desarrollo funcional cerrado temporalmente el 14 de agosto de 2026**.
La aplicación está validada en el equipo de referencia. La publicación para
cualquier PC sigue bloqueada por la firma de código pendiente; véase
[PROJECT_CLOSURE.md](./PROJECT_CLOSURE.md).

## Implementado

- Widget Electron, bandeja, instancia única y servidor Next.js standalone.
- Integración nativa con Antigravity IDE (Google AI Pro): sincronización de cuotas reales (restante y tiempo de reset) mediante el Language Server local en la tarjeta de Google Gemini.
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
- Renderer servido por un protocolo interno con lista cerrada de recursos; `file://` continúa sin privilegios adicionales.

## Validación de esta entrega

| Comprobación | Estado |
|---|---|
| ESLint 9 | Correcto |
| TypeScript estricto y sin caché incremental | Correcto |
| Tests unitarios dirigidos | 50/50 correctos |
| Auditoría del lockfile actualizado | 0 vulnerabilidades |
| `npm run check` con dependencias nuevas | Correcto en copia NTFS limpia |
| `npm run build` con Next.js 16 | Correcto en copia NTFS limpia |
| Paquete Electron `0.2.2` | Setup (110.981.533 bytes) y portable (110.761.113 bytes) generados desde NTFS |
| Arranque del paquete previo al sellado de fuses | HTTP 200 en `127.0.0.1:31873` con perfil aislado |
| Arranque del paquete final endurecido `0.2.2` | Instalado sobre `0.2.1`; servidor HTTP 200, ventana visible y cuatro proveedores renderizados |
| Configuración de fuses del EXE final | Verificada con `@electron/fuses read` |
| Navegador del sistema | Microsoft Edge 151 iniciado correctamente mediante Playwright |
| `electron:dev` invocado desde NAS | Correcto mediante staging NTFS; HTTP 200 en `127.0.0.1:32123` |
| Firma de los artefactos `0.2.2` locales | `NotSigned`; requieren certificado del mantenedor antes de distribuir |
| Carga visual del renderer `0.2.2` | Validada en la instalación final: URL interna, título, DOM, fondo, datos reales y panel de configuración correctos |

## Limitaciones reales

- Los endpoints internos, cookies y medidas anti-bot de los proveedores pueden cambiar.
- OpenAI puede bloquear el login automatizado con Cloudflare; no se intenta conservar un perfil persistente para sortearlo.
- DeepSeek requiere rehidratar el estado web capturado para consultar métricas que no ofrece su API pública.
- No existe conversión de divisas.
- El proveedor `custom` no consulta uso automáticamente.
- Una build local sin certificado seguirá pudiendo activar SmartScreen/EDR. El código no puede sustituir la reputación y firma del editor.
- Los artefactos locales `0.1.0`, `dashboard.exe` y `DashboardTray.exe` están retirados y no deben distribuirse.

## Deuda pendiente

Solo queda una deuda bloqueante para distribución: adquirir/configurar un
certificado de firma de código reconocido (o Azure Trusted Signing), generar la
release desde CI, verificar Authenticode y completar la prueba/allowlisting en
un equipo corporativo. Los binarios locales `0.2.2` son `NotSigned` y no deben
subirse a Releases ni describirse como instalables universalmente.

## Criterio de terminado

No presentar como release lista una build que no haya pasado `npm run check`, `npm run build`, empaquetado, validación de firma y prueba de arranque. La documentación debe distinguir siempre lo validado de lo pendiente.
