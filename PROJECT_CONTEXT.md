# Contexto de continuación

## Objetivo

Mantener un dashboard local Windows, en español y sin datos simulados, que agregue uso/coste/límites reales de proveedores de IA y pueda ejecutarse sin consola mediante un icono de bandeja.

## Entradas de lectura

1. [`README.md`](./README.md): uso e instalación rápida.
2. [`AGENTS.md`](./AGENTS.md): reglas técnicas para agentes/desarrollo.
3. [`Docs/README.md`](./Docs/README.md): índice documental.
4. [`Docs/PROJECT_STATUS.md`](./Docs/PROJECT_STATUS.md): implementado, validado y pendiente.
5. [`Docs/ARCHITECTURE.md`](./Docs/ARCHITECTURE.md): flujos y decisiones.

## Estado de ejecución

- Lanzador recomendado: `dist/DashboardTray.exe`.
- URL: `http://127.0.0.1:3000`.
- El tray inicia `dist/dashboard.exe` con `DASHBOARD_NO_BROWSER=1`.
- El servidor usa `dist/.env`.
- Para cerrar todo debe usarse **Salir** desde el icono.

## Decisiones que deben preservarse

- No mock data.
- Secretos sólo en `.env`, nunca en `localStorage` ni Git.
- `force-dynamic` en rutas sensibles.
- `output: standalone` y carpeta `dist/` indivisible.
- `inspector-shim.js` debe cargarse antes de `standalone/server.js` en `pkg`.
- Playwright completo se copia al standalone.
- La CLI de Playwright se resuelve desde `process.cwd()/node_modules/playwright/cli.js`.
- Build y desarrollo deben hacerse en NTFS local si el checkout está en NAS.
- Toda modificación relevante actualiza documentación y `Docs/PROJECT_STATUS.md`.

## Validación mínima para continuar

```powershell
npm run lint
npm run build
npm run exe
git diff --check
```

Después, con el paquete desplegado:

1. arrancar `DashboardTray.exe`;
2. comprobar una sola instancia y ausencia de consola;
3. comprobar HTTP 200;
4. abrir/cerrar ajustes;
5. verificar al menos una lectura real o un error de credencial accionable;
6. confirmar que `.env` no aparece en `git status`.

## Estado pendiente

Consulta [`Docs/PROJECT_STATUS.md`](./Docs/PROJECT_STATUS.md). No presentes como resuelto un estado de sesión caducada de DeepSeek o una organización Claude ausente sin reconectar y volver a validar.
