# Estado del proyecto

## Línea base actual

`0.3.0` — Despliegue Web Docker en NAS Synology y Sincronizador Automático de Suscripciones IA en segundo plano.

Estado: **desarrollo funcional y sincronización continua validados y operativos**.
La aplicación web se ejecuta 24/7 en Docker sobre el NAS Synology (`192.168.1.3:3000`), mientras un servicio demonio silencioso en segundo plano en Windows mantiene las métricas de Claude Pro, ChatGPT Plus y Antigravity (Gemini) sincronizadas automáticamente cada 60 segundos sin intervención manual.

## Implementado

- **Despliegue Web en Docker (NAS Synology)**: Operativo en `http://192.168.1.3:3000` con persistencia en volumen Docker de snapshots de uso y configuración.
- **Ingeniería Inversa de Antigravity IDE (Gemini)**: Descubrimiento y conexión con el RPC interno `/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary` del Language Server de Antigravity (`language_server_windows_x64.exe`), extrayendo métricas exactas de cuota semanal (`gemini-weekly`), cuota de 5 horas (`gemini-5h`), fechas de reseteo y saldo de créditos.
- **Sincronización Automática de Suscripciones (Claude Code & ChatGPT Plus)**: Extracción local de credenciales OAuth de Claude Code (`~/.claude/.credentials.json`) y sesión de ChatGPT Plus (`~/.codex/auth.json`), con consulta periódica a sus APIs de uso y desglose de consumo (Claude Code, Chats web, Cowork).
- **Servicio Silencioso en Segundo Plano para Windows**: Demonio en Node.js ejecutado mediante `sync-daemon-silent.vbs` con estilo de ventana 0 (completamente invisible, sin ventanas de consola ni popups en el escritorio).
- **Auto-reinicio y Resiliencia**: Bucle de supervisión que relanza el servicio si ocurre una caída imprevista, y espera inteligente de hasta 60s por si la unidad de red `Z:` tarda en montar al iniciar sesión en Windows.
- **Mutex de Instancia Única por Loopback**: Prevención infalible de instancias duplicadas mediante enlace al puerto TCP local `127.0.0.1:37482` (evitando los problemas de reciclaje de PIDs típicos de Windows).
- **Registro con Windows y Herramientas**: Integración en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` y carpeta `Startup`. Scripts auxiliares: `instalar-sincronizacion-automatica.bat`, `scripts/estado-servicio.bat` y `scripts/desinstalar-inicio-automatico.bat`.
- **Widget Electron, bandeja e instalador standalone**: Mantenidos y soportados para ejecución local aislada.
- **Eliminación de datos simulados**: Todas las métricas mostradas corresponden a mediciones reales de cuota y saldo de los proveedores.

## Validación de esta entrega

| Comprobación                                    | Estado                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ESLint 9                                        | Correcto                                                                                                           |
| TypeScript estricto y sin caché incremental     | Correcto                                                                                                           |
| Tests unitarios dirigidos                       | 50/50 correctos                                                                                                    |
| Auditoría del lockfile actualizado              | 0 vulnerabilidades (`npm audit --audit-level=high`) tras `npm audit fix`                                           |
| Formateo con Prettier                           | `format:check` correcto                                                                                            |
| `GET /api/health` + `GET /api/keys` (smoke)     | HTTP 200 y forma esperada en `.next/standalone`                                                                    |
| `npm run check` con dependencias nuevas         | Correcto en copia NTFS limpia                                                                                      |
| `npm run build` con Next.js 16                  | Correcto en copia NTFS limpia                                                                                      |
| Paquete Electron `0.2.2`                        | Setup (110.981.533 bytes) y portable (110.761.113 bytes) generados desde NTFS                                      |
| Arranque del paquete previo al sellado de fuses | HTTP 200 en `127.0.0.1:31873` con perfil aislado                                                                   |
| Arranque del paquete final endurecido `0.2.2`   | Instalado sobre `0.2.1`; servidor HTTP 200, ventana visible y cuatro proveedores renderizados                      |
| Configuración de fuses del EXE final            | Verificada con `@electron/fuses read`                                                                              |
| Navegador del sistema                           | Microsoft Edge 151 iniciado correctamente mediante Playwright                                                      |
| `electron:dev` invocado desde NAS               | Correcto mediante staging NTFS; HTTP 200 en `127.0.0.1:32123`                                                      |
| Firma de los artefactos `0.2.2` locales         | `NotSigned`; requieren certificado del mantenedor antes de distribuir                                              |
| Carga visual del renderer `0.2.2`               | Validada en la instalación final: URL interna, título, DOM, fondo, datos reales y panel de configuración correctos |

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
