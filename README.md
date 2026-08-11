# Dashboard de uso de APIs de IA

Aplicación local para Windows que centraliza el uso, los costes y los límites reales de OpenAI/ChatGPT, Anthropic/Claude, Google Gemini y DeepSeek. La interfaz está en español y no utiliza datos simulados.

## Inicio rápido en cualquier PC Windows

La forma recomendada de usar la aplicación es el lanzador de bandeja:

1. Copia la carpeta `dist/` completa al PC de destino. No copies solamente los ejecutables.
2. Ejecuta [`dist/DashboardTray.exe`](./dist/DashboardTray.exe).
3. Espera a que el icono pase de naranja a verde. El navegador abrirá `http://127.0.0.1:3000` una sola vez.
4. Configura las conexiones desde cada tarjeta o usa **Iniciar sesión web**.

No es necesario instalar Node.js, npm ni PowerShell en el PC de destino. `DashboardTray.exe` es una aplicación WinForms sin consola y `dashboard.exe` incluye el runtime del servidor.

### Icono de bandeja

| Estado | Significado |
|---|---|
| Naranja | El servidor está arrancando. |
| Verde | El dashboard responde correctamente. |
| Rojo | El servidor no responde o se cerró. |

- Doble clic: abre el dashboard.
- Clic derecho → **Abrir dashboard**: abre una nueva pestaña.
- Clic derecho → **Reiniciar servidor**: reinicia el proceso controlado por el icono.
- Clic derecho → **Salir**: cierra el icono y todo el árbol de procesos del servidor.

> `dashboard.exe` se conserva como lanzador directo de respaldo. El usuario final debe preferir `DashboardTray.exe`.

## Contenido obligatorio de `dist/`

```text
dist/
├── DashboardTray.exe     # lanzador recomendado y propietario del icono
├── dashboard.exe         # servidor empaquetado
├── server-entry.js       # entrada del servidor standalone
├── inspector-shim.js     # compatibilidad del runtime empaquetado
├── standalone/           # aplicación Next.js y dependencias de ejecución
├── .env_example          # ejemplo sin secretos
└── .env                  # se crea/actualiza localmente; contiene credenciales
```

Toda la carpeta debe permanecer unida. Para moverla a otro PC, comprímela o cópiala completa.

## Requisitos

- Windows 10/11 de 64 bits.
- Puerto local `3000` disponible.
- Navegador predeterminado configurado.
- Internet para consultar proveedores y para la primera descarga de Chromium de Playwright (~300 MB).
- Permisos de escritura sobre `dist/` para guardar `dist/.env`.

Consulta la guía detallada: [Instalación en Windows](./Docs/INSTALLATION_WINDOWS.md).

## Credenciales y migración

Las claves, cookies y sesiones se guardan en `dist/.env` cuando se usa el paquete o en `.env` cuando se ejecuta desde el código fuente. El valor está codificado en Base64 para su transporte, pero **no está cifrado**.

Para trasladar conexiones existentes:

1. Cierra el dashboard desde el icono.
2. Copia `dist/.env` al mismo lugar de la nueva instalación por un canal privado.
3. Arranca `DashboardTray.exe` en el nuevo PC.
4. Reconecta las sesiones que hayan expirado o estén vinculadas al equipo anterior.

Nunca subas `.env` a Git, correo, chat o almacenamiento público. Más información: [Seguridad](./Docs/SECURITY.md).

## Desarrollo

```powershell
npm ci
npm run dev      # http://localhost:3000
npm run lint
npm run build
npm run exe      # genera dashboard.exe y DashboardTray.exe
```

Para desarrollar o compilar, usa una ruta NTFS local. `next dev` puede bloquearse o devolver errores `Watchpack`, `EPERM` o `Access denied` cuando el repositorio está en una unidad SMB/NAS.

## Documentación

- [Índice de documentación](./Docs/README.md)
- [Instalación en Windows](./Docs/INSTALLATION_WINDOWS.md)
- [Arquitectura y flujos](./Docs/ARCHITECTURE.md)
- [Proveedores y métricas](./Docs/PROVIDERS.md)
- [Referencia de API local](./Docs/API_REFERENCE.md)
- [Seguridad y credenciales](./Docs/SECURITY.md)
- [Desarrollo y ampliación](./Docs/DEVELOPMENT.md)
- [Compilación y empaquetado](./Docs/PACKAGING.md)
- [Operación y resolución de problemas](./Docs/OPERATIONS_TROUBLESHOOTING.md)
- [Estado actual e historial técnico](./Docs/PROJECT_STATUS.md)
- [Contexto para continuar el proyecto](./PROJECT_CONTEXT.md)

## Estado comprobado

El 11 de agosto de 2026 se validó en Windows:

- compilación de producción y comprobación de tipos;
- ESLint sin errores;
- generación de ambos ejecutables;
- un único proceso `DashboardTray.exe` sin ventana (`MainWindowHandle = 0`);
- servidor hijo oculto y respuesta HTTP 200 en `127.0.0.1:3000`;
- carga real de las cinco integraciones configuradas;
- funcionamiento del panel de ajustes.

Las sesiones de proveedor pueden expirar de forma independiente. Un error de autenticación en una tarjeta no significa que el servidor haya dejado de funcionar.
