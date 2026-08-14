# Instalación en Windows

## Requisitos

- Windows 10/11 de 64 bits.
- Puerto local 3000 disponible.
- Internet para consultar proveedores.
- Microsoft Edge o Google Chrome para los inicios de sesión web automatizados.

## Instalador firmado

1. Descarga el instalador desde [GitHub Releases](https://github.com/Zambudio/Dashboard_Uso_APIs/releases).
2. Comprueba Propiedades → Firmas digitales y verifica que Windows muestre una firma válida del editor esperado.
3. Calcula el hash y compáralo con `SHA256SUMS.txt`:

   ```powershell
   Get-FileHash '.\Dashboard Uso APIs-0.2.2-Setup.exe' -Algorithm SHA256
   ```

4. Ejecuta el instalador y abre **Dashboard Uso APIs**.
5. El widget y el icono aparecerán; el dashboard completo está en `http://127.0.0.1:3000`.

La variante `portable.exe` no requiere instalación, pero conserva datos cifrados en el perfil de usuario de Windows, no junto al ejecutable.

## Configuración

El botón de engranaje del widget permite cambiar tema, opacidad, intervalo, inicio con Windows, modo siempre visible y proveedores mostrados. **Abrir dashboard** permite crear y editar integraciones.

Las credenciales quedan en `%APPDATA%\dashboard-uso-apis\credentials.enc`, ligadas al usuario/máquina mediante DPAPI. No copies ese fichero como método de migración; revoca o vuelve a conectar las cuentas en el equipo nuevo.

## Actualizar

1. Sal de la aplicación desde la bandeja.
2. Verifica firma y hash de la nueva release.
3. Instala encima de la anterior.
4. Las preferencias y credenciales del perfil de usuario se conservan.

## Antivirus corporativo

No desactives Defender ni crees exclusiones generales. Si un EDR bloquea una release correctamente firmada, entrega a TI el nombre del editor, versión, hash SHA-256 y enlace a la release para su proceso de allowlisting. Los binarios nuevos pueden necesitar reputación adicional incluso con firma válida.

Una build local o una release sin firma reconocida no se considera distribuible. La firma autofirmada no resuelve Smart App Control.

No ejecutes artefactos antiguos `0.1.0`, `dashboard.exe` o
`DashboardTray.exe`: pertenecen al empaquetado retirado y no tienen firma ni el
modelo actual de credenciales.

## Desde código fuente

```powershell
git clone https://github.com/Zambudio/Dashboard_Uso_APIs.git
cd Dashboard_Uso_APIs
npm ci
npm run check
npm run electron:dev
```

Usa Node.js 22.12+. Si el checkout está en NAS, `electron:dev` prepara el build
automáticamente en `%LOCALAPPDATA%` y no copia `.env`. El widget de desarrollo
usa `http://127.0.0.1:32123` y datos DPAPI separados de una instalación normal.
`npm run dev` abre solo el dashboard y mantiene compatibilidad heredada con
`.env`; no es la modalidad segura recomendada para usuarios finales.
