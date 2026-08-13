# Desarrollo

## Entorno

- Windows 10/11 x64.
- Node.js 22.12+ y npm 10+.
- Checkout NTFS local para build.

```powershell
npm ci
npm run dev
```

## Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | Next.js en desarrollo. |
| `npm run lint` | ESLint 9 y Core Web Vitals. |
| `npm run typecheck` | TypeScript estricto sin emitir. |
| `npm test` | Tests unitarios dirigidos; no ejecuta scripts de diagnóstico. |
| `npm run check` | lint + tipos + tests. |
| `npm run build` | Standalone de producción. |
| `npm run electron:dev` | Prepara standalone y abre Electron. |
| `npm run electron:build` | Instalador y portable locales. |
| `npm run release:windows` | Release firmada y SHA-256. |

## Estructura

```text
app/                    página y rutas locales
components/             UI del dashboard
electron/               proceso principal, preload, widget y broker
lib/usage/              fetchers por proveedor
lib/storage.ts          cliente local sin persistencia web
lib/env-keys.server.ts  acceso servidor al broker o .env heredado
types/api.ts            contratos compartidos
scripts/                standalone, empaquetado y release
Docs/                   documentación técnica y operativa
```

## Reglas

- Sin datos simulados.
- Sin secretos en renderer, `localStorage`, logs o Git.
- `unavailable` para datos no expuestos.
- Errores accionables en español.
- `force-dynamic` y `no-store` en rutas/lecturas sensibles.
- El proceso principal valida todo IPC.
- Electron usa `nodeIntegration: false`, aislamiento, sandbox y CSP.
- No exponer fuera de localhost.
- No editar artefactos compilados; regenerarlos.

## Añadir un proveedor

1. Amplía `ProviderKey` y `PROVIDER_DEFINITIONS`.
2. Implementa `lib/usage/<proveedor>.server.ts`.
3. Añade el caso de servidor y valida que ID/proveedor coincidan.
4. Si hay login web, captura solo lo imprescindible en un contexto efímero.
5. Añade logo/fallback y presentación.
6. Cubre parseo, errores y ausencia de campos con tests.
7. Documenta fuentes y limitaciones en `Docs/PROVIDERS.md`.

## Pull request

```powershell
npm run check
npm run build
npm audit --audit-level=high
git diff --check
git status --short
```

Confirma que no hay `.env`, volcados, binarios ni datos reales staged. Actualiza el documento especializado y `Docs/PROJECT_STATUS.md` sin presentar como validado lo que no se ejecutó.
