# Seguridad y credenciales

## Principios

- Servidor limitado a `127.0.0.1`.
- Secretos fuera del renderer y del almacenamiento web.
- Cifrado obligatorio en reposo para la distribución Electron.
- Validación en cada frontera: API local, IPC y broker.
- Sin datos simulados ni mensajes que oculten limitaciones del proveedor.

## Persistencia

| Dato | Ubicación Electron | Protección |
|---|---|---|
| Claves, tokens y sesiones | `%APPDATA%\Dashboard Uso APIs\credentials.enc` | `safeStorage`/DPAPI |
| Proveedores y preferencias | configuración de `electron-store` | No sensible |
| Posición, colapsado y ajustes nativos | configuración de `electron-store` | No sensible |
| Perfil de navegador | No persistido | Contexto efímero |

La aplicación no usa `localStorage`, `sessionStorage` ni cookies propias para conservar la sesión. DeepSeek y otros proveedores pueden exigir cookies o almacenamiento web de su origen; si se capturan, se serializan dentro del secreto cifrado y se rehidratan únicamente en un navegador efímero durante la consulta.

## Defensa del renderer Electron

- `nodeIntegration: false`.
- `contextIsolation: true`.
- `sandbox: true`.
- CSP local con `connect-src 'none'`.
- Navegaciones y ventanas nuevas bloqueadas.
- API de preload mínima y operaciones sensibles mediante IPC validado.
- Altura de ventana limitada al área útil de pantalla.
- Fuses de producción: `runAsNode`, `NODE_OPTIONS` e inspector deshabilitados;
  integridad ASAR y carga exclusiva desde `app.asar` habilitadas.
- El servidor standalone se ejecuta mediante `utilityProcess.fork`, no poniendo
  el ejecutable distribuido en modo Node.

## API local

- `/api/keys` GET devuelve solo IDs configurados.
- PUT/DELETE validan identificadores y tamaños.
- `/api/usage` comprueba que el ID almacenado corresponde al proveedor solicitado antes de usar la credencial.
- El broker exige token aleatorio y vuelve a validar el payload.
- Las respuestas sensibles usan `no-store` y las rutas son dinámicas.

El modelo sigue confiando en el usuario local: un proceso con capacidad de inspeccionar o manipular procesos del mismo usuario puede atacar la aplicación. No se debe exponer el puerto en LAN o Internet sin autenticación, TLS y una revisión de amenazas nueva.

## Desarrollo heredado

`npm run dev` sin Electron conserva compatibilidad con `.env` y Base64. Base64 no cifra. Esta modalidad es para desarrollo, no para distribuir a usuarios finales. La migración a Electron importa una vez las credenciales y elimina `DASHBOARD_PROVIDER_KEYS` del `.env` heredado.

## Firma y antivirus

SmartScreen, Smart App Control y muchos EDR valoran firma, reputación del editor, prevalencia y comportamiento. No hay un cambio de código que garantice la aceptación de un binario nuevo y sin reputación.

Una release pública debe:

1. compilarse en CI desde un tag;
2. firmarse con certificado reconocido mediante `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD`;
3. pasar `Get-AuthenticodeSignature`;
4. publicar `SHA256SUMS.txt`;
5. probarse en una máquina limpia y, para empresa, pasar el proceso de allowlisting del EDR.

La firma autofirmada sirve para laboratorio, no para reputación pública.

### Incidente del instalador 0.1.0

El 13 de agosto de 2026 Kaspersky registró el instalador interno sin firma
`Dashboard Uso APIs-0.1.0-Setup.exe` como `PDM.Win32.Generic`. El SHA-256 del
aviso (`0EF8AD1399EBBF9E4D0558FAC432C5467766F8289CF89BEFEDBE4AA9DDBEBFE6`)
coincidía exactamente con el artefacto local. `PDM` es una clasificación
proactiva por comportamiento; no basta para afirmar malware ni para declarar
por cuenta propia un falso positivo.

La versión `0.1.0` queda retirada y no debe recibir excepciones generales. La
respuesta correcta es generar una versión vigente desde CI, firmarla, verificar
su hash y facilitarla al equipo EDR para análisis o allowlisting por editor.

## Respuesta ante incidente

1. Cierra la aplicación desde la bandeja.
2. Revoca claves y sesiones en cada proveedor.
3. Aparta el almacén cifrado y cualquier `.env` afectado.
4. Genera credenciales nuevas.
5. Revisa `git status`, historial, logs y copias de seguridad.
6. Comunica vulnerabilidades según [la política raíz](../SECURITY.md).
