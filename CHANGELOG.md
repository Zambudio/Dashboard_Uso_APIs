# Historial de cambios

Este proyecto sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico mientras resulte compatible con la fase `0.x`.

## [Sin publicar]

### Añadido

- Panel de configuración integrado en el widget de escritorio.
- Flujo de CI, Dependabot y release Windows firmado con sumas SHA-256.
- Documentación de contribución, licencia y política de seguridad.

### Cambiado

- La versión `0.2.2` queda como línea base funcional de cierre temporal; la firma reconocida se documenta como deuda bloqueante para distribución pública.
- Una sola fuente de verdad para preferencias y proveedores en Electron.
- El renderer solo conoce si existe una credencial; nunca recibe su contenido.
- Las sesiones de navegador se capturan en contextos efímeros y se conservan únicamente en el almacén cifrado.
- Actualización a Next.js 16.3, React 19.2, Electron 43.4, TypeScript 5.9 y ESLint 9.39.
- El servidor Next se ejecuta como proceso auxiliar de Electron y el paquete evita duplicar dependencias web.
- Dependabot evita saltos semánticos mayores automáticos y los workflows usan las Actions vigentes.
- `npm run exe` usa el único empaquetador vigente, Electron Builder; se retiran `pkg` y el tray C#.
- La app empaquetada reutiliza Edge o Chrome para los flujos Playwright sin habilitar `runAsNode`.

### Seguridad

- El almacenamiento de credenciales falla de forma segura si DPAPI no está disponible.
- La persistencia del dashboard en `localStorage` se ha eliminado; las sesiones web se conservan cifradas. El login interactivo mantiene un perfil de navegador persistente solo para recordar la autenticación; la consulta automática de uso navega en contextos efímeros sin perfil en disco.
- `dist/`, binarios y volcados de diagnóstico dejan de versionarse.
- Se deshabilitan `runAsNode`, `NODE_OPTIONS` e inspector y se exige integridad/carga desde ASAR.

### Corregido

- El widget empaquetado ya no queda transparente: sus recursos se cargan mediante un protocolo interno seguro y el arranque falla de forma visible si el renderer no puede cargarse.
- El widget ya no queda inaccesible en otra pantalla: la bandeja lo restaura y lo centra en el monitor activo.
- Las posiciones que dejan solo una franja mínima visible se descartan al arrancar.
- `electron:dev` ya no intenta compilar sobre NAS/SMB: usa staging NTFS sin copiar secretos.
- El widget de desarrollo usa puerto, configuración y bloqueo de instancia separados de la aplicación instalada.
- Se retiran los artefactos y scripts que podían volver a generar la versión `0.1.0` sin firma.
- El staging NTFS ignora correctamente archivos versionados eliminados antes de compilar.
- Se documenta el aviso corporativo de Kaspersky del instalador interno `0.1.0` y su retirada.

### Auditoría y endurecimiento técnico (5 de septiembre de 2026)

#### Añadido

- `GET /api/health` (dinámico, `no-store`) para comprobar servidor y modo de ejecución.
- Smoke test HTTP de Caminos críticos (`GET /api/health`, `GET /api/keys`) como `npm run smoke`
  y en el pipeline de CI tras el build (`Docs/AUDIT_2026-09-05.md`).
- Prettier como formateador (`npm run format` / `npm run format:check`) con `.prettierrc.json` y `.prettierignore`.
- `Docs/CODE_SIGNING_AZURE.md` con el plan y pasos para firmar la app con Azure Trusted Signing.
- `Docs/AUDIT_2026-09-05.md`: auditoría técnica y legal completa y registro de ejecución.

#### Cambiado

- Modelo de sesión: el login interactivo usa un perfil persistente fuera del paquete
  (`%LOCALAPPDATA%\Dashboard_Uso_APIs\browser-profile`, con cifrado del sistema/DPAPI); la consulta
  automática de uso mantiene navegadores efímeros. Documentado en ARCHITECTURE, SECURITY y README.
- Seguridad del navegador de login: se retiran `--no-sandbox` y la desactivación de `site-per-process`;
  se elimina la detección de sesión basada en un nombre de usuario hardcodeado.
- `Detección de rutas de red` genérica en `next.config.js` para `WATCHPACK_POLLING` (UNC, ya no una letra fija).

#### Corregido

- Vulnerabilidades del lockfile: `fast-uri` (3.1.5 → 3.1.7) y `@xmldom/xmldom` (0.8.13 → 0.8.15);
  `npm audit --audit-level=high` queda en 0.
- El pipeline de CI ejecuta ahora `npm audit --audit-level=high`, `npm run check`, `npm run build` y `npm run smoke`.

#### Retirado

- `arrancar-widget.bat`, `arrancar-widget.vbs` y `scripts/create-self-signed-cert.ps1` (sin revisar y contrarios a la política de firma).
- Artefactos de `build/` y `scratch/` y `Thumbs.db` del checkout (no versionados; regenerables).

#### Pendiente externo

- Probada la app en clean-room (50/50 tests, 0 vulnerabilidades, build, smoke, electron:build). La
  autenticación de login en vivo con cuentas reales de cada proveedor (suscripción y API key) y la
  firma con Azure Trusted Signing requieren credenciales y validación que no son posibles desde código.
