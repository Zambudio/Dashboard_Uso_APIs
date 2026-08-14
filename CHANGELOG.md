# Historial de cambios

Este proyecto sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico mientras resulte compatible con la fase `0.x`.

## [Sin publicar]

### Añadido

- Panel de configuración integrado en el widget de escritorio.
- Flujo de CI, Dependabot y release Windows firmado con sumas SHA-256.
- Documentación de contribución, licencia y política de seguridad.

### Cambiado

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
- Los perfiles persistentes de Playwright y la persistencia del dashboard en `localStorage` se han eliminado.
- `dist/`, binarios y volcados de diagnóstico dejan de versionarse.
- Se deshabilitan `runAsNode`, `NODE_OPTIONS` e inspector y se exige integridad/carga desde ASAR.

### Corregido

- El widget ya no queda inaccesible en otra pantalla: la bandeja lo restaura y lo centra en el monitor activo.
- Las posiciones que dejan solo una franja mínima visible se descartan al arrancar.
- `electron:dev` ya no intenta compilar sobre NAS/SMB: usa staging NTFS sin copiar secretos.
- El widget de desarrollo usa puerto, configuración y bloqueo de instancia separados de la aplicación instalada.
- Se retiran los artefactos y scripts que podían volver a generar la versión `0.1.0` sin firma.
- El staging NTFS ignora correctamente archivos versionados eliminados antes de compilar.
- Se documenta el aviso corporativo de Kaspersky del instalador interno `0.1.0` y su retirada.
