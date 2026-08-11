# Compilación y empaquetado Windows

## Resultado

`npm run exe` ejecuta `next build` y después `scripts/build-exe.js`.

```text
dist/
├── DashboardTray.exe
├── dashboard.exe
├── server-entry.js
├── inspector-shim.js
├── .env_example
└── standalone/
```

## Etapas

```mermaid
flowchart LR
    A[next build] --> B[.next/standalone]
    B --> C[Copiar static y public]
    C --> D[Copiar Playwright completo]
    D --> E[pkg: dashboard.exe]
    D --> F[csc /target:winexe]
    F --> G[DashboardTray.exe]
```

### 1. Next.js standalone

`next.config.js` usa `output: 'standalone'`. El empaquetador copia:

- `.next/standalone`;
- `.next/static` a `standalone/.next/static`;
- `public/` a `standalone/public`;
- los paquetes completos `playwright` y `playwright-core`.

Next no copia `public` y static automáticamente al standalone; omitir este paso deja la interfaz sin logos o assets.

### 2. Servidor `dashboard.exe`

`@yao-pkg/pkg` compila `launcher.js` para `node22-win-x64`. El ejecutable:

- verifica que `standalone/server.js` exista;
- usa `127.0.0.1:3000` por defecto;
- evita iniciar otro servidor si el puerto ya responde;
- lanza `server-entry.js` con el `.env` situado junto al ejecutable;
- abre el navegador salvo que reciba `DASHBOARD_NO_BROWSER=1`.

Los callbacks de sondeo se protegen para que timeout y error no abran múltiples pestañas.

### 3. Compatibilidad de `inspector`

El runtime de `pkg` no ofrece `inspector`, pero Next lo carga en su trazador. `server-entry.js` requiere primero `inspector-shim.js` y después el servidor standalone.

### 4. Playwright

El navegador Chromium no se incorpora al repositorio ni al paquete. Se descarga bajo demanda. La CLI se localiza en:

```text
<cwd standalone>/node_modules/playwright/cli.js
```

No uses `path.dirname(require.resolve('playwright'))` dentro de código compilado por Next: Webpack puede sustituir la resolución por un id numérico y provocar `The "path" argument must be of type string`.

### 5. Bandeja `DashboardTray.exe`

`scripts/tray-launcher.cs` se compila con el `csc.exe` de .NET Framework incluido en Windows:

- `/target:winexe`: sin consola;
- `/platform:anycpu`;
- referencias a `System`, `System.Drawing` y `System.Windows.Forms`.

El PC de destino no necesita el compilador. El icono crea una instancia única mediante mutex y controla el proceso del servidor.

## Compilar desde una unidad NAS

No es fiable. Next puede fallar al crear o bloquear `.next` en SMB. Procedimiento recomendado:

1. copia el código a una carpeta temporal NTFS local;
2. ejecuta `npm ci` y `npm run exe` allí;
3. detén el paquete activo;
4. copia el nuevo `dist/` al destino;
5. conserva el `dist/.env` operativo;
6. arranca `DashboardTray.exe` y valida HTTP 200.

## Firma

`scripts/sign-exe.ps1` ofrece firma autofirmada para laboratorio, pero no equivale a una firma pública con reputación. Para releases corporativas, firma ambos ejecutables con un certificado reconocido y publica checksums.

## Validación del paquete

- `DashboardTray.exe` permanece activo sin ventana.
- Sólo existe una instancia del icono.
- `dashboard.exe` y su hijo tampoco muestran consola.
- `GET /` devuelve 200.
- El icono pasa a verde.
- **Salir** cierra el árbol propiedad del icono.
- Las claves siguen disponibles y no aparecen en Git.
