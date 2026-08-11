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

El JSON se codifica en Base64 dentro de `.env`. Base64 **no es cifrado**. Quien lea el archivo puede reutilizar las credenciales mientras sigan válidas.

## Ubicación

- Desarrollo: `<repo>/.env`.
- Paquete: `<dist>/.env`.
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

## Riesgos conocidos

- Los endpoints internos de proveedores pueden cambiar sin aviso.
- La automatización de DOM puede romperse si cambia la interfaz.
- Las sesiones pueden estar vinculadas al dispositivo o revocarse.
- Un proceso distinto que responda HTTP 200 en el puerto 3000 podría confundirse con el dashboard; comprueba el puerto si el contenido abierto no es el esperado.
- No existe cifrado en reposo gestionado por la aplicación.

## Respuesta ante incidente

1. Cierra el icono de bandeja.
2. Revoca sesiones y claves desde cada proveedor.
3. Mueve o elimina de forma segura el `.env` afectado.
4. Genera credenciales nuevas.
5. Revisa `git status`, historial, copias de seguridad y canales por los que pasó el archivo.
