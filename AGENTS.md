# AGENTS.md

Dashboard Next.js 14 App Router para uso, coste y límites reales de OpenAI/ChatGPT, Anthropic/Claude, Google Gemini y DeepSeek. Interfaz en español, ejecución local Windows y paquete standalone con icono de bandeja.

## Lectura obligatoria

Antes de modificar comportamiento o arquitectura, leer:

- [README.md](./README.md)
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- [Docs/README.md](./Docs/README.md)
- [Docs/PROJECT_STATUS.md](./Docs/PROJECT_STATUS.md)

La documentación forma parte del cambio. Actualizar el documento especializado y el estado en el mismo commit.

## Arquitectura

- Página única cliente: `app/page.tsx`.
- Componentes visuales: `components/`.
- Modelos: `types/api.ts`.
- Catálogo de proveedores: `lib/providers.ts`.
- Persistencia cliente y llamadas locales: `lib/storage.ts`.
- Secretos: `lib/env-keys.server.ts` → `.env`.
- API local:
  - `app/api/keys/route.ts`
  - `app/api/usage/route.ts`
  - `app/api/auth/browser-login/route.ts`
- Fetchers: `lib/usage/*.server.ts`.
- Login interactivo: `lib/browser-login.server.ts`.
- Empaquetado: `launcher.js`, `server-entry.js`, `inspector-shim.js`, `scripts/build-exe.js`.
- Bandeja Windows: `scripts/tray-launcher.cs` → `dist/DashboardTray.exe`.

## Reglas permanentes

- Sin datos simulados.
- No almacenar secretos en `localStorage` ni Git.
- Base64 no se considera cifrado.
- Mantener `force-dynamic` en rutas de credenciales y uso.
- Representar datos no expuestos con `unavailable`.
- Mantener mensajes de error accionables en español.
- No exponer el servidor fuera de localhost sin autenticación y revisión de seguridad.
- No editar manualmente artefactos compilados para sustituir cambios de fuente; regenerar con `npm run exe`.
- No usar `require.resolve('playwright')` en código empaquetado por Next para construir la ruta de su CLI.
- Preservar `.env` al reemplazar `dist/`.

## Desarrollo y build

```powershell
npm ci
npm run dev
npm run lint
npm run build
npm run exe
```

No ejecutar build o desarrollo desde SMB/NAS si aparecen Watchpack, EPERM o bloqueos de `.next`; usar una copia NTFS local y desplegar después `dist/`.

## Criterios de validación

- lint y build correctos;
- `git diff --check` correcto;
- ambos ejecutables generados;
- una instancia del tray, sin ventana;
- HTTP 200 en `127.0.0.1:3000`;
- interacción básica de UI;
- ningún secreto staged;
- documentación sincronizada y sin presentar trabajo planificado como validado.
