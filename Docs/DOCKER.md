# Despliegue con Docker y Docker Compose

Esta guía detalla cómo ejecutar **Dashboard Uso APIs** en cualquier entorno (incluyendo tu PC personal, servidor doméstico o NAS) utilizando Docker sin necesidad de instalar Node.js ni configurar Electron.

---

## 1. Características del despliegue en Docker

- **Autocontenido y ligero**: Basado en imagen oficial `node:22-alpine` multi-etapa con compilación `standalone` de Next.js 16.
- **Seguridad**: Se ejecuta bajo usuario de sistema sin privilegios (`nextjs:1001`, grupo `nodejs:1001`).
- **Persistencia total**: Las credenciales, configuración de tarjetas y los snapshots de uso se guardan en el volumen nombrado de Docker `dashboard-data` montado en `/app/.data`.
- **Acceso universal**: Expuesto en el puerto `3000` (`http://localhost:3000` o la IP de red local del equipo).
- **Instalable como aplicación (PWA)**: Compatible con instalación de escritorio nativa desde navegadores como Brave, Chrome o Edge.

---

## 2. Requisitos previos

- Tener instalado **Docker Desktop** (en Windows/macOS) o el motor **Docker Engine con plugin Compose** (en Linux).
- Verificar que Docker está en funcionamiento:
  ```bash
  docker compose version
  ```

---

## 3. Puesta en marcha rápida (Un solo comando)

Desde la raíz del proyecto (`Dashboard_Uso_APIs`):

```bash
# Construir la imagen e iniciar el contenedor en segundo plano
docker compose up -d --build
```

Una vez levantado, abre en tu navegador:
👉 **`http://localhost:3000`** (o `http://<IP-DE-TU-PC>:3000` desde cualquier otro dispositivo de tu red local).

Para comprobar el estado y logs del contenedor:
```bash
docker compose logs -f
```

Para detener el servicio:
```bash
docker compose down
```

---

## 4. Persistencia de datos

El archivo [`docker-compose.yml`](../docker-compose.yml) define:

```yaml
services:
  dashboard-ia:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: monitor-apis-ia
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DASHBOARD_ENV_FILE=/app/.data/.env
    volumes:
      - dashboard-data:/app/.data
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  dashboard-data:
```

### ¿Qué se almacena en el volumen `dashboard-data`?
1. `/app/.data/.env`: Claves cifradas de proveedores, orden de tarjetas y preferencias del dashboard.
2. `/app/.data/usage-cache.json`: Datos reales y snapshots de consumo de cada proveedor (Claude Pro, OpenAI, Gemini, DeepSeek).

> [!NOTE]
> Gracias al volumen `dashboard-data`, puedes reiniciar el contenedor, actualizar la imagen o reiniciar tu PC sin perder ninguna clave ni el histórico de uso.

---

## 5. Sincronización de proveedores en Docker

Al correr dentro de un contenedor Linux Alpine (sin interfaz gráfica de escritorio), el contenedor no ejecuta navegadores de escritorio locales (como Microsoft Edge o Google Chrome de Windows). 

Para proveedores que dependen de sesiones web (como **Claude Pro** o **DeepSeek**):

1. **Sincronización inicial o periódica**:
   - En la interfaz web, pulsa el botón **⚡ Sincronizar Navegador** (en la barra superior o en cada tarjeta).
   - Puedes usar el **Bookmarklet** o la **Extensión local** incluida en la carpeta `extension/`.
   - Al pulsar el bookmarklet desde la pestaña de uso oficial de Claude, ChatGPT o DeepSeek en tu navegador habitual, los datos se enviarán inmediatamente a la API del contenedor (`/api/usage/sync`) y quedarán persistidos en el volumen.
2. **Fallback automático sin errores**:
   - Si se pulsa "Actualizar" en una tarjeta y el backend detecta un entorno sin navegador gráfico, responde de forma segura utilizando el snapshot persistido más reciente en caché, sin mostrar fallos de Playwright ni errores en rojo.

---

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

Tus datos en el volumen `dashboard-data` se mantendrán intactos.
