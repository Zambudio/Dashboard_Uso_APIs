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
- Actualización a Next.js 16.3, React 19.2 y Electron 43.4.
- El servidor Next se ejecuta como proceso auxiliar de Electron y el paquete evita duplicar dependencias web.

### Seguridad

- El almacenamiento de credenciales falla de forma segura si DPAPI no está disponible.
- Los perfiles persistentes de Playwright y la persistencia del dashboard en `localStorage` se han eliminado.
- `dist/`, binarios y volcados de diagnóstico dejan de versionarse.
- Se deshabilitan `runAsNode`, `NODE_OPTIONS` e inspector y se exige integridad/carga desde ASAR.
