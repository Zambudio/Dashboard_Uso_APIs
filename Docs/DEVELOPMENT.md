# Desarrollo y ampliación

## Entorno recomendado

- Windows 10/11 x64.
- Node.js compatible con Next.js 14; el paquete ejecutable apunta a Node 22 x64.
- npm y Git.
- Repositorio en disco NTFS local para desarrollo y build.

```powershell
npm ci
npm run dev
```

## Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor Next.js de desarrollo. |
| `npm run lint` | ESLint con `next/core-web-vitals`. |
| `npm run build` | Build standalone, lint y comprobación de tipos. |
| `npm run start` | Servir el build con `next start`. |
| `npm run exe` | Build y generación de ambos ejecutables Windows. |

No hay actualmente suite de tests unitarios o E2E versionada. La validación mínima antes de commit es lint, build, arranque del paquete, HTTP 200 e interacción básica del dashboard.

## Estructura

```text
app/                  página y rutas API
components/           componentes visuales
lib/providers.ts      catálogo de proveedores
lib/storage.ts        persistencia cliente y API local
lib/env-keys.server.ts persistencia sensible
lib/usage/            fetchers y scraping por proveedor
types/api.ts          contratos compartidos
scripts/build-exe.js  empaquetador Windows
scripts/tray-launcher.cs lanzador de bandeja
launcher.js           lanzador interno del servidor
Docs/                 documentación mantenida
```

## Añadir un proveedor

1. Amplía `ProviderKey` en `types/api.ts`.
2. Añade la definición a `PROVIDER_DEFINITIONS`.
3. Implementa `lib/usage/<proveedor>.server.ts` y devuelve `ApiUsageSnapshot`.
4. Añade el caso en `app/api/usage/route.ts`.
5. Si necesita login web, añade flujo en `lib/browser-login.server.ts`.
6. Añade logo o fallback en `components/ProviderLogo.tsx`.
7. Revisa la presentación de campos en `ProviderCard.tsx`.
8. Documenta fuente, métricas y limitaciones en `Docs/PROVIDERS.md`.
9. Valida un caso real, un secreto inválido y los campos no disponibles.

## Reglas de implementación

- No usar datos simulados.
- No guardar secretos en `localStorage`.
- No devolver valores cero para representar datos desconocidos; usa `unavailable`.
- Mantener errores accionables en español.
- No exponer el servidor fuera de localhost sin una revisión de seguridad.
- Mantener las rutas API como `force-dynamic`.
- Conservar la copia completa de Playwright en el standalone.
- Resolver `playwright/cli.js` desde `process.cwd()/node_modules`, no con `require.resolve` dentro del bundle.

## Estado cliente

`app/page.tsx` mantiene proveedores, preferencias, modales y orden de tarjetas. Al iniciar:

- completa proveedores estándar ausentes;
- hidrata secretos desde `/api/keys`;
- refresca integraciones configuradas en paralelo;
- persiste configuración sanitizada sin `apiKey`.

El orden manual sólo se aplica con `sortOrder: default`. Arrastrar una tarjeta actualiza `cardOrder`.

## Revisión previa a commit

```powershell
npm run lint
npm run build
git diff --check
git status --short
```

Comprueba además:

- que `.env` no está staged;
- que `dist/standalone/public/` contiene logos;
- que `DashboardTray.exe` y `dashboard.exe` corresponden al mismo build;
- que los enlaces Markdown son relativos al archivo que los contiene;
- que `Docs/PROJECT_STATUS.md` refleja sólo validaciones ejecutadas.
