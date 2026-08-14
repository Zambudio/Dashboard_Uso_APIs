# Operación y resolución de problemas

## Operación diaria

- Engranaje: configuración del widget.
- Botón expandir: dashboard completo en `http://127.0.0.1:3000`.
- Cerrar: oculta el widget; la aplicación sigue en la bandeja.
- Bandeja → **Salir**: cierra widget, servidor y proceso principal.

## El widget o icono no aparece

1. Revisa el menú `^` de iconos ocultos.
2. Ejecuta una sola vez la aplicación; la segunda instancia activa la primera.
3. Comprueba en Administrador de tareas que no haya una instancia bloqueada.
4. Si es una instalación corporativa, pide a TI el evento del EDR usando hash y editor; no desactives el antivirus.

## Servidor no disponible

Usa bandeja → **Reiniciar servidor** y abre `http://127.0.0.1:3000`. Comprueba el puerto:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000
```

El widget reintenta a los 15 segundos tras un fallo puntual. Otro proceso en el puerto debe cerrarse antes de iniciar.

## Chromium

La aplicación empaquetada usa Microsoft Edge y, como alternativa, Google Chrome.
En desarrollo también puede usar el Chromium administrado por Playwright:

```powershell
npx playwright install chromium
```

En redes con proxy, configura la salida de Node/Playwright según la política corporativa. No descargues binarios de fuentes no oficiales.

## Errores por proveedor

| Mensaje | Acción |
|---|---|
| 401/403 OpenAI | Comprueba permisos; una Project Key normalmente no lee costes globales. |
| Cloudflare OpenAI | El proveedor ha bloqueado automatización; usa una vía oficial/manual disponible. |
| 401/403 Anthropic | Usa una Admin API Key o reconecta la sesión correcta. |
| Sesión DeepSeek caducada | Inicia sesión web de nuevo. |
| Organización Claude ausente | Reconecta y confirma organización/plan accesible. |
| Gemini sin métricas | Una API key puede validar acceso sin exponer límites de suscripción. |

## Credenciales

En Electron, si `credentials.enc` se pierde o DPAPI deja de poder descifrarlo, vuelve a conectar proveedores. No copies el fichero entre equipos: está ligado al usuario/máquina.

Si sospechas exposición, cierra la app, revoca todas las credenciales afectadas y genera otras nuevas. Nunca adjuntes `.env`, `credentials.enc`, volcados de DeepSeek o capturas con tokens a un issue.

## NAS/SMB

Watchpack, `EPERM`, error 4390 al crear junctions o bloqueos de `.next` indican
que Turbopack no puede compilar sobre ese servidor SMB. Usa
`npm run electron:dev`: el lanzador crea una copia NTFS segura bajo
`%LOCALAPPDATA%\DashboardUsoAPIs\dev-worktree` y arranca en el puerto `32123`.
No copies manualmente `.env` a esa carpeta.

Si el comando termina sin mostrar ventana, comprueba la bandeja. El modo de
desarrollo tiene un bloqueo de instancia y almacén propios, así que una versión
instalada en el puerto `3000` no debería impedir ya su arranque.

## Artefactos antiguos

Los ejecutables `0.1.0`, `dashboard.exe` y `DashboardTray.exe` están retirados.
Si aún aparecen en una copia local de `dist/`, no los ejecutes ni los entregues:
regenera la versión vigente con `npm run electron:build`.
