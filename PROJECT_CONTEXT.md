# Contexto de continuación

## Objetivo

Mantener una aplicación local Windows, en español y sin datos simulados, que agregue uso, coste y límites reales de proveedores de IA mediante un widget Electron y un dashboard web local.

## Lectura obligatoria

1. [`README.md`](./README.md)
2. [`AGENTS.md`](./AGENTS.md)
3. [`Docs/README.md`](./Docs/README.md)
4. [`Docs/PROJECT_STATUS.md`](./Docs/PROJECT_STATUS.md)
5. [`Docs/ARCHITECTURE.md`](./Docs/ARCHITECTURE.md)

## Decisiones vigentes

- Electron es la distribución recomendada.
- El servidor solo escucha en `127.0.0.1`.
- El renderer nunca recibe valores secretos; `/api/keys` solo devuelve IDs configurados.
- `safeStorage`/DPAPI es obligatorio para persistir credenciales en Electron. Si no está disponible, se falla de forma segura.
- Proveedores y preferencias se guardan en `electron-store`; no se duplican en `localStorage`.
- Los logins usan contextos efímeros. Las cookies o tokens exigidos por un proveedor se guardan únicamente dentro del bloque cifrado.
- `force-dynamic` se mantiene en rutas de configuración, credenciales y uso.
- Los datos no expuestos se representan con `unavailable`.
- `dist/` es un artefacto, no código fuente, y se publica mediante GitHub Releases.
- Una release pública Windows debe estar firmada con certificado reconocido y acompañada de SHA-256.
- Playwright se copia completo al standalone y su CLI se resuelve desde `process.cwd()`.

## Validación mínima

```powershell
npm ci
npm run check
npm run build
git diff --check
```

Para una release: `npm run release:windows`, comprobación de firma, instalación limpia, una sola instancia, HTTP 200 en `127.0.0.1:3000` e interacción básica del widget.

`npm run electron:dev` crea automáticamente una copia NTFS sin secretos en
`%LOCALAPPDATA%\DashboardUsoAPIs\dev-worktree`, usa el puerto `32123` y datos de
usuario separados. Para otros builds desde NAS/SMB sigue siendo necesaria una
copia NTFS.
