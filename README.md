# Dashboard de uso de APIs de IA

Aplicación local para Windows que centraliza el uso, los costes y los límites reales de OpenAI/ChatGPT, Anthropic/Claude, Google Gemini y DeepSeek. La interfaz está en español y no utiliza datos simulados.

Se puede usar de dos formas: como **widget flotante de escritorio** (nuevo, con Electron) o como **dashboard web** en el navegador (`DashboardTray.exe`, el lanzador original). Ambas comparten el mismo servidor y las mismas integraciones — el widget añade una ventana compacta con todos los proveedores y un icono de bandeja, y cifra las credenciales con `safeStorage`/DPAPI en vez de Base64.

## Widget de escritorio (Electron) — nuevo

1. Copia la carpeta `dist/` completa al PC de destino.
2. Ejecuta [`dist/Dashboard Uso APIs-0.1.0-Setup.exe`](./dist/) (instalador) o la versión `-portable.exe` si prefieres no instalar nada.
3. Aparece una ventana flotante sin bordes con las tarjetas de todos los proveedores configurados (con su icono real), más un icono de bandeja con menú: **Mostrar widget**, **Abrir en navegador**, **Reiniciar servidor**, **Salir**.
4. Si tenías un `.env` de una instalación anterior con claves/cookies guardadas, se importa automáticamente una sola vez a un almacén cifrado (`credentials.enc`, cifrado con DPAPI) la primera vez que arranca.

Cada tarjeta muestra icono del proveedor, punto de estado, uso (%/saldo) y, cuando el proveedor lo expone, el tiempo hasta el próximo reset ("Reset: 3 h" / "Reset: 7 d"). Desde **Ajustes del panel** en el dashboard web se controla también el widget:

- **Transparencia del widget de escritorio**: un slider (30-100%) ajusta la opacidad del panel flotante.
- **Proveedores visibles en el widget**: casillas independientes de "Ocultar" — permiten mostrar un proveedor en el dashboard web pero no en el widget compacto, o viceversa.

> **Aviso de seguridad de Windows:** el instalador y el portable no tienen todavía una firma de código con reputación en la nube de Microsoft (ver [Seguridad](./Docs/SECURITY.md)). Si tu PC tiene activado **Smart App Control**, Windows puede bloquear la primera ejecución. Si eso ocurre, tendrás que aprobarlo manualmente (o mantener Smart App Control desactivado) hasta que el binario tenga una firma reconocida. Si prefieres evitar ese aviso por completo, usa `DashboardTray.exe` (más abajo), que no lo dispara.

Detalles de arquitectura: [Widget de escritorio en ARCHITECTURE.md](./Docs/ARCHITECTURE.md#widget-de-escritorio-electron).

## Dashboard web en el navegador (DashboardTray.exe)

Forma alternativa, sin ventana flotante propia — abre el dashboard completo en tu navegador:

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
├── Dashboard Uso APIs-0.1.0-Setup.exe     # instalador del widget (Electron)
├── Dashboard Uso APIs-0.1.0-portable.exe  # versión portable del widget
├── DashboardTray.exe     # lanzador del dashboard web y propietario del icono
├── dashboard.exe         # servidor empaquetado (usado por DashboardTray.exe)
├── server-entry.js       # entrada del servidor standalone
├── inspector-shim.js     # compatibilidad del runtime empaquetado
├── standalone/           # aplicación Next.js y dependencias, para DashboardTray.exe
├── .env_example          # ejemplo sin secretos
└── .env                  # se crea/actualiza localmente; contiene credenciales (solo ruta DashboardTray.exe)
```

El widget de Electron no usa `dist/standalone/` ni `dist/.env` — lleva su propia copia del servidor dentro del instalador y guarda las credenciales cifradas en `%APPDATA%\Dashboard Uso APIs\credentials.enc`. Toda la carpeta `dist/` debe permanecer unida de todas formas si vas a usar también `DashboardTray.exe`.

## Requisitos

- Windows 10/11 de 64 bits.
- Puerto local `3000` disponible.
- Navegador predeterminado configurado.
- Internet para consultar proveedores y para la primera descarga de Chromium de Playwright (~300 MB).
- Permisos de escritura sobre `dist/` para guardar `dist/.env`.

Consulta la guía detallada: [Instalación en Windows](./Docs/INSTALLATION_WINDOWS.md).

## Credenciales y migración

**Con `DashboardTray.exe` (dashboard web):** las claves, cookies y sesiones se guardan en `dist/.env` cuando se usa el paquete o en `.env` cuando se ejecuta desde el código fuente. El valor está codificado en Base64 para su transporte, pero **no está cifrado**.

**Con el widget de Electron:** se cifran de verdad con `safeStorage` (DPAPI en Windows), en `%APPDATA%\Dashboard Uso APIs\credentials.enc`. Al estar ligado a usuario/máquina, ya no es un fichero portable que puedas copiar sin más a otro PC — si migras de equipo, reconecta las sesiones desde el widget o desde el dashboard web (**Abrir en navegador**). Un `.env` antiguo se importa una sola vez al primer arranque.

Para trasladar conexiones existentes entre PCs con `DashboardTray.exe`:

1. Cierra el dashboard desde el icono.
2. Copia `dist/.env` al mismo lugar de la nueva instalación por un canal privado.
3. Arranca `DashboardTray.exe` en el nuevo PC.
4. Reconecta las sesiones que hayan expirado o estén vinculadas al equipo anterior.

Nunca subas `.env` a Git, correo, chat o almacenamiento público. Más información: [Seguridad](./Docs/SECURITY.md).

## Desarrollo

```powershell
npm ci
npm run dev           # http://localhost:3000 (dashboard web sin Electron)
npm run lint
npm run build
npm test               # node --test — módulos puros de electron/lib y lib/cred-broker-client.js
npm run exe            # genera dashboard.exe y DashboardTray.exe (ruta antigua)
npm run electron:dev   # arranca el widget de Electron en modo desarrollo
npm run electron:build # genera el instalador y la versión portable del widget
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

El 11 de agosto de 2026 se validó en Windows (dashboard web, `DashboardTray.exe`):

- compilación de producción y comprobación de tipos;
- ESLint sin errores;
- generación de ambos ejecutables;
- un único proceso `DashboardTray.exe` sin ventana (`MainWindowHandle = 0`);
- servidor hijo oculto y respuesta HTTP 200 en `127.0.0.1:3000`;
- carga real de las cinco integraciones configuradas;
- funcionamiento del panel de ajustes.

El mismo día se validó también el widget de escritorio (Electron):

- 33 tests unitarios (`npm test`) de los módulos puros del broker de credenciales, el almacén cifrado, el gestor del servidor y el color de la bandeja;
- arranque completo en modo desarrollo (`npm run electron:dev`) con instancia única, broker de credenciales y servidor Next.js;
- migración real de las 5 claves/cookies del `.env` heredado de este equipo al almacén cifrado (`credentials.enc`, prefijo DPAPI `v10` confirmado — no es Base64/JSON legible);
- widget mostrando datos reales de los proveedores configurados (capturas de pantalla), incluyendo errores reales sin inventar datos (p. ej. sesión de DeepSeek caducada);
- detección de caída del servidor (matando el proceso hijo de Next.js) y actualización del estado en el widget/bandeja;
- generación correcta del instalador y la versión portable con `electron-builder`.
- **Pendiente:** no se pudo confirmar por ejecución directa que el `.exe` final empaquetado arranca en esta máquina de prueba concreta — Smart App Control de Windows bloqueó el binario recién compilado por no tener firma con reputación en la nube (ver [Seguridad](./Docs/SECURITY.md)). Por eso `DashboardTray.exe`/`dashboard.exe` **no se han retirado**: siguen siendo la vía probada mientras alguien confirma el arranque del widget en un equipo real.

Las sesiones de proveedor pueden expirar de forma independiente. Un error de autenticación en una tarjeta no significa que el servidor haya dejado de funcionar.

### Entrega del 11 de agosto de 2026 (tarde): fiabilidad de DeepSeek y personalización del widget

Se investigaron a fondo (con evidencia real, no suposiciones) dos bugs que hacían que DeepSeek mostrara "sesión caducada" incluso con una sesión válida:

1. **La condición de espera del scraper era prematura.** Se esperaba a que apareciera la etiqueta "Topped-up balance" en la página, pero esa etiqueta forma parte del esqueleto estático y aparece antes de que el importe real termine de cargar — el scraper leía la página demasiado pronto y la reportaba como "sin datos" (falso negativo). Corregido: ahora se exige un símbolo de moneda junto a la etiqueta, señal real de que el dato ya está pintado.
2. **El broker de credenciales servía siempre la primera lectura, congelada para siempre.** El `fetch()` que lee `/credentials` del broker se ejecuta dentro de una ruta de Next.js, cuyo `fetch` global cachea las respuestas por defecto — sin `cache: 'no-store'`, cualquier escritura posterior (login de un proveedor, sesión de DeepSeek refrescada) nunca se reflejaba en una lectura posterior, y un guardado que primero "lee todo + fusiona + escribe todo" podía revertir en silencio cambios recientes de otros proveedores. Corregido en `lib/cred-broker-client.js`, con test de regresión.

Además: reintento automático si el primer intento de scraping falla, persistencia de las cookies/localStorage refrescados tras cada consulta en vivo (para no depender para siempre de la sesión capturada en el login original) y logging de diagnóstico no sensible para futuros fallos. Verificado end-to-end contra la cuenta real de DeepSeek del usuario: la consulta en vivo funciona y el almacén cifrado se actualiza con cada refresco exitoso.

También se añadió: iconos reales de cada proveedor en las tarjetas del widget, tiempo hasta el próximo reset cuando el proveedor lo expone, control de transparencia del panel y visibilidad por proveedor independiente para el widget — todo verificado con `npm test` (34/34), `tsc --noEmit`, `next lint`, `next build` y una sesión real de `electron:dev` con inspección de la consola del renderer.
