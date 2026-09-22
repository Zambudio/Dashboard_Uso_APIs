# AGENTS.md

Dashboard Next.js 16 App Router y Electron para uso, coste y límites reales de OpenAI/ChatGPT, Anthropic/Claude, Google Gemini y DeepSeek. Interfaz en español, ejecución local Windows y paquete standalone con icono de bandeja.

## Lectura obligatoria

Antes de modificar comportamiento o arquitectura, leer:

- [README.md](./README.md)
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- [Guia_Conexion_ssh_NAS.md](./Guia_Conexion_ssh_NAS.md)
- [Docs/README.md](./Docs/README.md)
- [Docs/DOCKER.md](./Docs/DOCKER.md)
- [Docs/PROJECT_STATUS.md](./Docs/PROJECT_STATUS.md)
- [Docs/PROJECT_CLOSURE.md](./Docs/PROJECT_CLOSURE.md)

La documentación forma parte del cambio. Actualizar el documento especializado y el estado en el mismo commit.

## Conexión SSH y Docker en el NAS (Synology DS224+)

- Host: `192.168.1.3`, Puerto: `32`, Alias SSH: `nas-zambu`.
- Conexión: `ssh -o BatchMode=yes nas-zambu "<comando>"`
- Binario Docker: `sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker`
- Binario Docker Compose: `sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker-compose` (usar `docker-compose` con guion, NO `docker compose`).
- Ruta del proyecto en el NAS: `/volume1/NAS-DRIVE-PEDRO/IA/02_Proyectos/Dashboard_Uso_APIs`
- Despliegue/rebuild en NAS:
  `ssh -o BatchMode=yes nas-zambu "cd /volume1/NAS-DRIVE-PEDRO/IA/02_Proyectos/Dashboard_Uso_APIs && sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker-compose up -d --build"`

## Arquitectura

- Página única cliente: `app/page.tsx`.
- Componentes visuales: `components/`.
- Modelos: `types/api.ts`.
- Catálogo de proveedores: `lib/providers.ts`.
- Persistencia cliente y llamadas locales: `lib/storage.ts`.
- Secretos: broker Electron + `safeStorage`/DPAPI; `.env` solo como compatibilidad de desarrollo.
- Configuración no sensible: `electron-store` a través del broker.
- API local:
  - `app/api/keys/route.ts`
  - `app/api/usage/route.ts`
  - `app/api/auth/browser-login/route.ts`
- Fetchers: `lib/usage/*.server.ts`.
- Login interactivo: `lib/browser-login.server.ts`.
- Empaquetado recomendado: `electron/`, `server-entry.js`, `inspector-shim.js`, `scripts/prepare-standalone.js` y `electron-builder`.
- Bandeja Windows: proceso principal y `Tray` nativo de Electron.

## Reglas permanentes

- Sin datos simulados.
- No almacenar secretos en `localStorage` ni Git.
- No devolver valores secretos al renderer ni a `GET /api/keys`.
- Fallar de forma segura si `safeStorage` no está disponible.
- Base64 no se considera cifrado.
- Mantener `force-dynamic` en rutas de credenciales y uso.
- Representar datos no expuestos con `unavailable`.
- Mantener mensajes de error accionables en español.
- No exponer el servidor fuera de localhost sin autenticación y revisión de seguridad.
- No editar ni versionar artefactos compilados; regenerarlos con `npm run electron:build`.
- No usar `require.resolve('playwright')` en código empaquetado por Next para construir la ruta de su CLI.
- Las releases públicas requieren firma reconocida y SHA-256.
- Respetar el cierre temporal de `0.2.2`: no iniciar nuevas iteraciones salvo
  reapertura explícita, corrección de seguridad o rotura de un proveedor.

## Desarrollo y build

```powershell
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run electron:build
```

`npm run exe` es un alias compatible de `npm run electron:build`; no existe un
segundo empaquetador ni una ruta de distribución heredada.

`npm run electron:dev` usa staging NTFS automático. Para otros builds desde
SMB/NAS, si aparecen Watchpack, EPERM, error 4390 o bloqueos de `.next`, usar una
copia NTFS local y desplegar después `dist/`.

## Criterios de validación

- lint y build correctos;
- `git diff --check` correcto;
- instalador y portable generados;
- firma válida para releases públicas;
- una instancia del tray, sin ventana;
- HTTP 200 en `127.0.0.1:3000`;
- interacción básica de UI;
- ningún secreto staged;
- documentación sincronizada y sin presentar trabajo planificado como validado.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
