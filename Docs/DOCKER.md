# Despliegue con Docker y Docker Compose (NAS / Servidor Local / PC)

Esta guía detalla cómo ejecutar **Dashboard Uso APIs** en cualquier entorno (incluyendo tu NAS Synology, QNAP, TrueNAS, Unraid, servidor doméstico o PC) utilizando Docker para tener el servicio activo 24/7 en tu red local.

---

## 1. Características del despliegue en Docker

- **Autocontenido y ligero**: Basado en imagen oficial `node:22-alpine` multi-etapa con compilación `standalone` de Next.js 16.
- **Seguridad**: Se ejecuta bajo usuario de sistema sin privilegios (`nextjs:1001`, grupo `nodejs:1001`).
- **Persistencia total**: Las credenciales, configuración de tarjetas y los snapshots de uso se guardan en el volumen de Docker `dashboard-data` montado en `/app/.data`.
- **Acceso universal en red local**: Expuesto en el puerto `3000` (`http://localhost:3000` o `http://<IP-DE-TU-NAS>:3000`).
- **Autenticación obligatoria**: el contenedor escucha en `0.0.0.0:3000` y exige `DASHBOARD_AUTH_TOKEN` (ver [sección 2.1](#21-autenticación-obligatoria)). Aun así, la conexión es HTTP sin cifrar: no publiques este puerto a Internet ni lo reenvíes desde el router; para acceso remoto usa VPN o un proxy inverso HTTPS.
- **Sincronización multi-dispositivo**: El Bookmarklet y la extensión detectan automáticamente la IP/host del NAS o permiten configurarla para enviar las métricas de uso desde cualquier PC de la red.
- **Healthcheck integrado**: Monitorización de salud automática cada 30 segundos.

---

## 2. Puesta en marcha rápida en tu NAS o Servidor

### 2.1 Autenticación obligatoria

El contenedor **no arranca sin token**: `docker-compose.yml` interpola
`${DASHBOARD_AUTH_TOKEN:?...}` y la imagen fija `DASHBOARD_REQUIRE_AUTH=1`, de
modo que si el token falta o tiene menos de 32 caracteres el servidor responde
`503` a todo salvo `/api/health` (fallo seguro).

| Variable                 | Obligatoria | Uso                                                                      |
| ------------------------ | ----------- | ------------------------------------------------------------------------ |
| `DASHBOARD_AUTH_TOKEN`   | Sí (Docker) | Secreto compartido, mínimo 32 caracteres (`openssl rand -hex 32`).       |
| `DASHBOARD_AUTH_USER`    | No          | Usuario para el navegador (HTTP Basic). Por defecto `admin`.             |
| `DASHBOARD_REQUIRE_AUTH` | Fijada      | `1` en el `Dockerfile` y en `docker-compose.yml`; no hace falta tocarla. |

Cómo se usa el token:

- **Navegador**: al abrir `http://<IP-NAS>:3000` aparece el diálogo nativo de
  credenciales. Usuario `DASHBOARD_AUTH_USER` (por defecto `admin`) y
  contraseña = `DASHBOARD_AUTH_TOKEN`. El navegador las reutiliza para las
  llamadas internas a `/api/*`.
- **Sincronizador de Windows** (`scripts/sync-subscriptions.js`,
  `scripts/sync-antigravity.js`): envían `Authorization: Bearer <token>` si
  existe la variable de entorno `DASHBOARD_AUTH_TOKEN` en el PC
  (`setx DASHBOARD_AUTH_TOKEN "<token>"` y reiniciar el demonio).
- **Extensión**: campo «Token» del popup (se guarda en `chrome.storage.local`).
- **Bookmarklet / consola**: campo «Token (solo Docker)» del modal
  «Sincronizar»; el código generado lo incluye, así que el marcador guardado
  contiene el token: trátalo como un secreto.

Rutas sin autenticación: `GET /api/health` (healthcheck), `GET /bookmarklet.js`
(código público sin secretos) y el preflight `OPTIONS /api/usage/sync`.

Fuera de Docker (widget Electron en `127.0.0.1`, `npm run dev`) la
autenticación está desactivada salvo que se defina `DASHBOARD_AUTH_TOKEN`; el
widget Electron nunca la hereda. Ojo: `npm run dev` carga el `.env` de la raíz,
así que si ese `.env` contiene el token, el modo desarrollo también pedirá
credenciales.

El `.dockerignore` excluye `.env*` del contexto de build para que ningún
secreto acabe dentro de la imagen.

### Opción A: Desde la terminal del NAS (SSH / Docker Compose)

```bash
# 1. Clonar o copiar la carpeta del proyecto en tu NAS
cd /ruta/hacia/Dashboard_Uso_APIs

# 2. Definir el token en el .env junto a docker-compose.yml (no se versiona)
echo "DASHBOARD_AUTH_TOKEN=$(openssl rand -hex 32)" >> .env

# 3. Construir la imagen e iniciar el contenedor en segundo plano
docker compose up -d --build
```

Una vez levantado, abre en cualquier navegador de tu red local:
👉 **`http://<IP-DE-TU-NAS>:3000`** (por ejemplo: `http://192.168.1.50:3000`).

### Opción B: En Synology (Container Manager) / QNAP (Container Station) / Portainer

1. Abre **Container Manager** (Synology) o **Portainer**.
2. Ve a la sección **Proyecto** / **Stacks** y selecciona **Crear**.
3. Selecciona la carpeta del proyecto con el `docker-compose.yml` o pega el contenido del archivo.
4. Define la variable de entorno `DASHBOARD_AUTH_TOKEN` (en el `.env` de la carpeta o en el apartado de variables del stack).
5. Pulsa **Iniciar / Implementar**.

---

## 3. Persistencia de datos

El archivo [`docker-compose.yml`](../docker-compose.yml) define:

```yaml
services:
  dashboard-ia:
    build:
      context: .
      dockerfile: Dockerfile
    image: dashboard-uso-apis:latest
    container_name: dashboard-uso-apis
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DASHBOARD_ENV_FILE=/app/.data/.env
      - DASHBOARD_REQUIRE_AUTH=1
      - DASHBOARD_AUTH_TOKEN=${DASHBOARD_AUTH_TOKEN:?Define DASHBOARD_AUTH_TOKEN en el .env junto a docker-compose.yml (openssl rand -hex 32)}
      - DASHBOARD_AUTH_USER=${DASHBOARD_AUTH_USER:-admin}
    volumes:
      - dashboard-data:/app/.data
    extra_hosts:
      - 'host.docker.internal:host-gateway'
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:3000/api/health || exit 1']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  dashboard-data:
    name: dashboard-uso-apis-data
```

### ¿Qué se almacena en el volumen `dashboard-data`?

1. `/app/.data/.env`: Claves cifradas de proveedores, orden de tarjetas y preferencias del dashboard.
2. `/app/.data/usage-cache.json`: Datos reales y snapshots de consumo de cada proveedor (Claude Pro, OpenAI, Gemini, DeepSeek).

> [!NOTE]
> Gracias al volumen `dashboard-data`, puedes reiniciar el contenedor, actualizar la imagen o reiniciar tu NAS sin perder ninguna clave ni el histórico de uso.

---

## 4. Sincronización de proveedores desde tu navegador al NAS

Para proveedores de suscripción (como **Claude Pro**, **ChatGPT Plus**, **Google Gemini** o **DeepSeek**):

1. **Desde tu navegador habitual (Brave, Chrome, Edge)**:
   - Abre el Dashboard en tu navegador: `http://<IP-DE-TU-NAS>:3000`.
   - Pulsa el botón **⚡ Sincronizar** (en la barra superior o en cualquier tarjeta).
2. **Usa el Bookmarklet 1-Clic o la Extensión**:
   - **Bookmarklet**: Escribe el token en «Token (solo Docker)» y arrastra el botón a tus marcadores. Cuando estés en `claude.ai`, `chatgpt.com`, `gemini.google.com` o `platform.deepseek.com`, haz clic en el marcador. Enviará las métricas directamente a la IP de tu NAS.
   - **Extensión**: Carga la carpeta `extension/` en `chrome://extensions` y en el popup configura la URL de tu NAS (`http://<IP-NAS>:3000`) y guarda el token. Sincronizará automáticamente en segundo plano.
3. **API Keys estándar**:
   - Si utilizas API Keys directas (OpenAI API, Anthropic API, DeepSeek API, Google AI Studio API), puedes introducirlas directamente en la interfaz del Dashboard alojado en el NAS y las consultará de forma autónoma.

## 6. Instalar como Aplicación Independiente en Windows (Brave / Chrome / Edge)

Para tener el monitor abierto como una app de escritorio independiente con su propio icono en la barra de tareas de Windows:

1. Abre `http://localhost:3000` en tu navegador.
2. En la barra de direcciones, pulsa el icono de instalación (pantalla con flecha hacia abajo en Brave/Chrome o icono de app en Edge).
3. Selecciona **"Instalar Monitor de APIs de IA"** y marca **"Crear acceso directo en el escritorio"**.
4. Haz clic derecho sobre el icono en la barra de tareas > **"Anclar a la barra de tareas"**.

---

## 7. Actualización del contenedor con nuevas versiones del código

Cuando hagas cambios en el repositorio o descargues una nueva versión:

```bash
git pull
docker compose up -d --build
```

Si `docker compose` falla con `Define DASHBOARD_AUTH_TOKEN...`, falta el token
en el `.env` junto a `docker-compose.yml` (sección 2.1).

Tus datos en el volumen `dashboard-data` se mantendrán intactos.
