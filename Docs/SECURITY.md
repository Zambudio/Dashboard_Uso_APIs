# Seguridad y gestión de credenciales

## Modelo de confianza

La aplicación está diseñada para un único usuario en un PC de confianza. El servidor se enlaza a `127.0.0.1` y no debe publicarse directamente en una LAN o Internet.

## Qué se almacena

`DASHBOARD_PROVIDER_KEYS` puede contener:

- API keys administrativas;
- cookies de sesión;
- bearer tokens;
- cookies estructuradas y `localStorage` de una consola;
- snapshots de uso guardados junto a una sesión.

**Con `DashboardTray.exe` (dashboard web) o `npm run dev`:** el JSON se codifica en Base64 dentro de `.env`. Base64 **no es cifrado**. Quien lea el archivo puede reutilizar las credenciales mientras sigan válidas.

**Con el widget de escritorio (Electron):** el mismo JSON se cifra de verdad con `safeStorage` (usa DPAPI en Windows, ligado a usuario+máquina) antes de escribirse a disco, en `credentials.enc`. El servidor Next.js sigue siendo un proceso Node aparte que no puede llamar a `safeStorage` directamente, así que habla con el proceso Electron a través de un broker HTTP en `127.0.0.1` con un puerto efímero y un token aleatorio de 24 bytes generado en cada arranque (`electron/credential-broker.js`) — ni el puerto ni el token se reutilizan entre arranques, y el broker solo acepta peticiones con el token exacto en la cabecera `Authorization`. Si `DASHBOARD_CRED_BROKER_URL`/`_TOKEN` no están en el entorno del proceso (p. ej. `npm run dev` sin Electron), se usa el `.env` en Base64 de siempre — el cifrado es exclusivo de la app empaquetada/`electron:dev`.

Al estar ligado a DPAPI del usuario/máquina, `credentials.enc` no es portable entre PCs como sí lo era `.env`: si migras de equipo, reconecta las sesiones en vez de copiar el fichero. Un `.env` heredado se importa una sola vez, automáticamente, la primera vez que arranca el widget (si el almacén cifrado está vacío).

## Ubicación

- Desarrollo (`npm run dev`) o `DashboardTray.exe`: `<repo>/.env` o `<dist>/.env`.
- Widget de Electron: `%APPDATA%\Dashboard Uso APIs\credentials.enc` (cifrado) para las claves de proveedor; `DASHBOARD_CONFIG`/`DASHBOARD_PREFERENCES` (no sensibles) siguen en `.env` sin cifrar, igual que antes.
- Chromium de Playwright: `%LOCALAPPDATA%\ms-playwright`.

Los `.env`, certificados y claves privadas están excluidos por `.gitignore`. Antes de cada commit debe verificarse con `git status` y una búsqueda de secretos.

## Recomendaciones

1. Restringe permisos NTFS de la carpeta al usuario que ejecuta la aplicación.
2. No instales el paquete en una carpeta compartida con escritura o lectura para otros usuarios.
3. Copia `.env` sólo mediante un canal privado.
4. Cierra sesiones en los proveedores si sospechas una filtración.
5. Usa claves administrativas sólo cuando la métrica realmente lo requiera.
6. No captures ni publiques logs que puedan contener cabeceras, cookies o respuestas completas.
7. Mantén el servidor en localhost.

## Navegador interactivo

Playwright abre una ventana visible para que el usuario introduzca sus credenciales directamente en el proveedor. La aplicación no debe registrar contraseñas, OTP ni passkeys. Después detecta el estado autenticado mediante cookies, tokens, respuestas o DOM y guarda sólo lo necesario para futuras lecturas.

Cada sesión:

- expira tras cinco minutos;
- puede cancelarse desde la UI;
- cierra Chromium al completarse o cancelarse;
- se elimina del mapa de sesiones después de la limpieza.

## Binarios Windows

`DashboardTray.exe` se compila con el compilador C# de Microsoft como `winexe`, sin consola y sin depender de PowerShell. `dashboard.exe` se crea con `@yao-pkg/pkg`.

Los binarios del repositorio no están firmados por una autoridad pública. Una copia descargada de Internet puede activar SmartScreen. No se debe recomendar desactivar SmartScreen o Defender; la solución para distribución profesional es una firma de código reconocida y un proceso de releases verificable.

`scripts/sign-exe.ps1` genera una firma autofirmada para entornos controlados. Esa firma sólo aporta confianza si el certificado se instala explícitamente en el equipo y no evita Smart App Control.

El instalador/portable del widget de Electron (`electron-builder`) tampoco tiene firma con reputación en la nube. En una máquina con **Smart App Control activado**, esto puede ir más allá del aviso de SmartScreen: Windows puede **bloquear la ejecución directamente** ("Una directiva de Control de aplicaciones bloqueó este archivo"), algo comprobado durante el desarrollo de este empaquetado. No hay forma de evitarlo sin una firma de código con reputación (CA reconocida) — un certificado autofirmado no sirve para esto.

## Riesgos conocidos

- Los endpoints internos de proveedores pueden cambiar sin aviso.
- La automatización de DOM puede romperse si cambia la interfaz.
- Las sesiones pueden estar vinculadas al dispositivo o revocarse.
- Un proceso distinto que responda HTTP 200 en el puerto 3000 podría confundirse con el dashboard; comprueba el puerto si el contenido abierto no es el esperado.
- Con `DashboardTray.exe`/`npm run dev`: no existe cifrado en reposo gestionado por la aplicación (Base64 en `.env`). Con el widget de Electron, las claves de proveedor sí se cifran (`safeStorage`/DPAPI), pero `DASHBOARD_CONFIG`/`DASHBOARD_PREFERENCES` (nombres, orden, preferencias — no secretos) siguen sin cifrar en `.env`.
- El broker de credenciales del widget escucha solo en `127.0.0.1` con un token efímero, pero cualquier proceso local que consiga leer las variables de entorno del servidor Next.js (`DASHBOARD_CRED_BROKER_URL`/`_TOKEN`) podría usarlas mientras el proceso siga vivo — mismo modelo de confianza de "único usuario en un PC de confianza" que el resto de la aplicación.
- Ningún binario (widget o `dashboard.exe`/`DashboardTray.exe`) tiene firma pública con reputación; en máquinas con Smart App Control activado esto puede bloquear la ejecución, no solo mostrar un aviso.

## Respuesta ante incidente

1. Cierra el icono de bandeja.
2. Revoca sesiones y claves desde cada proveedor.
3. Mueve o elimina de forma segura el `.env` afectado.
4. Genera credenciales nuevas.
5. Revisa `git status`, historial, copias de seguridad y canales por los que pasó el archivo.
