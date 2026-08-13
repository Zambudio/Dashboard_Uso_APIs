# Contribuir

Gracias por ayudar a mejorar Dashboard Uso APIs. Antes de abrir un cambio, revisa [la arquitectura](./Docs/ARCHITECTURE.md), [la guía de desarrollo](./Docs/DEVELOPMENT.md) y las reglas de [AGENTS.md](./AGENTS.md).

## Preparación

Requiere Windows 10/11, Node.js 22.12 o posterior y npm 10 o posterior.

```powershell
npm ci
npm run dev
```

No desarrolles desde SMB/NAS si aparecen errores de Watchpack, `EPERM` o bloqueos de `.next`; usa una copia NTFS local.

## Antes de enviar un pull request

```powershell
npm run check
npm run build
git diff --check
```

- No incluyas `.env`, cookies, tokens, volcados ni ejecutables.
- No añadas datos simulados a la aplicación.
- Añade pruebas para la lógica nueva o explica por qué solo puede validarse manualmente.
- Actualiza el documento especializado y `Docs/PROJECT_STATUS.md`.
- Describe qué se ha validado realmente y qué queda pendiente.

Los cambios de seguridad deben comunicarse de forma privada siguiendo [SECURITY.md](./SECURITY.md), no mediante un issue público.
