# Dashboard_Uso_APIs

Dashboard (Next.js 14) para trackear uso/coste real de proveedores de API de IA (OpenAI, Anthropic, DeepSeek) y del % de uso de suscripciones Pro (Claude Pro). Todos los datos vienen de la API real de cada proveedor — nada es simulado.

## Uso rápido (usuario final)

1. Descarga/clona el repo.
2. Entra en la carpeta `dist/`.
3. Ejecuta `dashboard.exe`. Se abrirá `http://127.0.0.1:3000` en tu navegador.
4. Introduce tus claves desde la web (botón "Conectar" o "Configurar" en cada tarjeta). Se guardan automáticamente en un archivo `.env` que se crea **junto a `dashboard.exe`** (no en el repo, no se sube a git). Pulsa "Actualizar" en la tarjeta para consultar los datos reales.

Importante: `dashboard.exe` necesita `standalone/`, `server-entry.js` e `inspector-shim.js` a su lado (todo dentro de `dist/`). Si copias el exe a otro sitio, copia la carpeta `dist/` entera.

## Proveedores soportados y métodos de conexión

| Proveedor | Tipo | Método de conexión | Métricas que obtiene |
|---|---|---|---|
| **Anthropic Claude** | Suscripción Pro / API | **Inicio de sesión web** (o cookie `sessionKey` / Admin API key) | % de uso de la sesión de 5h y del límite semanal, y cuenta regresiva de reset. |
| **OpenAI / ChatGPT** | ChatGPT Plus / API | **Inicio de sesión web** (o Admin API key) | % de uso semanal de ChatGPT Plus (`/backend-api/wham/usage`), reset, o consumo de tokens/coste si es API. |
| **Google Gemini** | Suscripción Pro / Advanced | **Inicio de sesión web** | % de uso actual (reseteo diario) y % de límite semanal (reseteo semanal). |
| **DeepSeek** | Consola Web / API | **Inicio de sesión web** (o API key tradicional) | Saldo total recargado, coste acumulado real ($), tokens consumidos y número de peticiones. |

---

## Sistema de Inicio de Sesión Web Automático (Browser Login)

Para evitar que el usuario tenga que buscar cookies en las herramientas de desarrollador o generar claves complejas, el dashboard incluye un sistema de **Inicio de sesión web interactivo**:

1. **Apertura de Chromium seguro**: Al pulsar **"Iniciar sesión web"** en cualquier tarjeta, el servidor lanza una instancia interactiva de Chromium (vía Playwright) con scripts de enmascaramiento anti-detección (`navigator.webdriver` deshabilitado, soporte de ventanas emergentes para Google OAuth).
2. **Identificación por el usuario**: El usuario inicia sesión cómodamente en la web del proveedor (por ejemplo con Google, email o contraseña).
3. **Extracción y persistencia automática**:
   - Para **Claude Pro**: Captura la cookie de sesión y consulta el endpoint interno de uso.
   - Para **OpenAI / ChatGPT Plus**: Captura las cookies y consulta `chatgpt.com/backend-api/wham/usage`.
   - Para **Google Gemini**: Lee los límites de uso actual y semanal directamente de la interfaz de Gemini.
   - Para **DeepSeek**: Analiza la consola `platform.deepseek.com/usage` para extraer el saldo, coste total, tokens y número de peticiones.
4. **Cierre automático y actualización**: Una vez detectadas las métricas, la ventana de Chromium se cierra sola y la tarjeta del dashboard se actualiza en tiempo real.

---

## Cómo se guardan las claves y credenciales

- El dashboard **no** usa `localStorage` para las credenciales sensibles.
- Al guardar o iniciar sesión web, el servidor almacena las claves/cookies en un archivo local `.env` como `DASHBOARD_PROVIDER_KEYS=<JSON id→secreto codificado en base64>`.
- Las llamadas subsiguientes leen los datos desde `.env` y mantienen los valores sincronizados.
- **Seguridad**: El archivo `.env` nunca se sube al repositorio de control de versiones (está ignorado en `.gitignore`).

---

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000, usa .env en la raíz del repo
npm run build    # build de producción (next build, output standalone)
npm run start    # sirve el build (sin empaquetar)
npm run lint     # verificación de tipado y ESLint
```

## Configurar en un PC nuevo con las sesiones ya conectadas

El repositorio de git **nunca** contiene el archivo `.env` (está en `.gitignore` a propósito: contiene cookies de sesión reales — para DeepSeek incluye literalmente las cookies de tu cuenta de Google). Por eso, clonar el repo por sí solo **no** trae tus sesiones conectadas.

Para tener las 5 tarjetas ya logueadas en un equipo nuevo sin repetir el login web en cada una:

1. `git clone` el repo en el equipo nuevo.
2. Copia el archivo `.env` de este proyecto (la copia "maestra" vive en este equipo, en la carpeta del repo) a la raíz del clon nuevo. Cópialo **a mano**, por un canal privado que ya controles (USB, tu NAS, un gestor de contraseñas) — nunca por git, email o un chat.
3. `npm install`
4. `npm run dev` — las 5 tarjetas deberían aparecer ya conectadas. Pulsa "Actualizar" si alguna sesión web ha caducado entre tanto (verás el aviso en la propia tarjeta).

Trata ese `.env` como una contraseña maestra: quien lo tenga puede operar tus cuentas de OpenAI, Anthropic, Gemini y Google (vía DeepSeek) tal cual. Si alguna vez sospechas que se ha filtrado, cierra sesión en esas cuentas desde sus propias webs (revoca sesiones activas) y vuelve a conectar cada proveedor desde el dashboard.

## Generar el `.exe`

```bash
npm run exe
```

Esto ejecuta `next build` y luego `scripts/build-exe.js`, empaquetando `dashboard.exe` en `dist/` junto con el build standalone de Next.js.

---

## Arquitectura

Ver [`AGENTS.md`](./AGENTS.md).
