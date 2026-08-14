# Dashboard Uso APIs

[![CI](https://github.com/Zambudio/Dashboard_Uso_APIs/actions/workflows/ci.yml/badge.svg)](https://github.com/Zambudio/Dashboard_Uso_APIs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Aplicación local para Windows que reúne en un solo panel el uso, los costes, saldos y límites reales que exponen OpenAI/ChatGPT, Anthropic/Claude, Google Gemini y DeepSeek. La interfaz está en español y nunca rellena huecos con datos simulados.

## Características

- Widget Electron compacto, configurable y con icono de bandeja.
- Dashboard completo en el navegador local.
- Consultas paralelas a proveedores y errores accionables en español.
- Panel del widget para tema, opacidad, refresco, inicio con Windows, posición superior y proveedores visibles.
- Credenciales cifradas con `safeStorage`/DPAPI en Windows.
- El renderer nunca recibe claves, cookies ni tokens: solo conoce si una conexión está configurada.
- Contextos de login efímeros; no quedan perfiles de navegador persistentes.
- Configuración no sensible separada de las credenciales.

## Proveedores

| Integración | Fuente | Datos disponibles |
|---|---|---|
| OpenAI / ChatGPT | API y sesión web cuando el proveedor lo permite | Uso, costes, plan y saldo según permisos reales |
| Anthropic API | API oficial | Uso y costes según permisos de la organización |
| Claude Pro / Code | Sesión web | Límites de sesión y semanales |
| Google Gemini | API / sesión web | Disponibilidad, cuota y plan cuando se exponen |
| DeepSeek | API y consola web | Saldo y métricas visibles en la cuenta |

Los proveedores cambian sus endpoints y medidas anti-bot. Cuando un dato no está disponible, la aplicación lo marca como `unavailable` en vez de inventarlo.

## Instalación

### Release para Windows

Descarga el instalador o el portable desde [GitHub Releases](https://github.com/Zambudio/Dashboard_Uso_APIs/releases). Verifica que la firma digital sea válida y compara el SHA-256 con `SHA256SUMS.txt`.

> Una release pública sin firma reconocida puede ser bloqueada por SmartScreen, Smart App Control o el antivirus corporativo. El workflow de release falla si no dispone de un certificado válido; una firma autofirmada no es suficiente.

### Desde el código fuente

Requisitos: Windows 10/11, Node.js 22.12 o posterior y npm 10 o posterior.

```powershell
git clone https://github.com/Zambudio/Dashboard_Uso_APIs.git
cd Dashboard_Uso_APIs
npm ci
npm run check
npm run electron:dev
```

`electron:dev` detecta que el repositorio puede vivir en NAS/SMB y prepara
automáticamente una copia de trabajo sin secretos en
`%LOCALAPPDATA%\DashboardUsoAPIs\dev-worktree`. El widget de desarrollo usa el
puerto `32123` y un almacén DPAPI independiente, por lo que puede convivir con
una instalación abierta en el puerto `3000`.

Para ejecutar solo el dashboard web:

```powershell
npm run dev
```

Abre `http://127.0.0.1:3000`. En desarrollo sin Electron, las credenciales usan el `.env` local heredado; no es la modalidad recomendada para usuarios finales.

## Privacidad y seguridad

- Todo se procesa en el equipo del usuario.
- El servidor escucha en `127.0.0.1`, nunca en todas las interfaces.
- En Electron, los secretos viven en `%APPDATA%\Dashboard Uso APIs\credentials.enc`, cifrados por DPAPI y ligados al usuario de Windows.
- Las preferencias viven en el almacén local no sensible de Electron.
- No se usa `localStorage` ni cookies de la aplicación para persistir sesiones.
- Algunos proveedores autentican sus propias páginas mediante cookies o tokens web. Cuando son imprescindibles, se capturan como un bloque opaco, se cifran y no se instalan como cookies persistentes del widget.

Consulta el [modelo de seguridad](./Docs/SECURITY.md) y la [política para vulnerabilidades](./SECURITY.md).

## Desarrollo

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run electron:dev` traslada automáticamente su build a NTFS. Para
`npm run build`, `npm run dev` o empaquetado manual desde SMB/NAS, usa una copia
NTFS si aparecen fallos de Watchpack, `EPERM`, junctions o bloqueos de `.next`.

Los artefactos de `dist/` no se versionan. Se generan en CI o localmente:

```powershell
npm run electron:build       # build local, puede quedar sin firma
npm run release:windows      # exige certificado y verifica la firma
```

`npm run exe` se conserva únicamente como alias de `electron:build`; ya no
genera los antiguos `dashboard.exe`/`DashboardTray.exe`.

## Documentación

- [Instalación Windows](./Docs/INSTALLATION_WINDOWS.md)
- [Arquitectura](./Docs/ARCHITECTURE.md)
- [Seguridad](./Docs/SECURITY.md)
- [Proveedores y métricas](./Docs/PROVIDERS.md)
- [Empaquetado y firma](./Docs/PACKAGING.md)
- [Estado del proyecto](./Docs/PROJECT_STATUS.md)
- [Contribuir](./CONTRIBUTING.md)

## Licencia

[MIT](./LICENSE) © 2026 Pedro Zambudio.
