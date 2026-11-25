# Guía de conexión SSH al NAS para IAs

> Guía operativa para que cualquier agente de IA pueda conectarse automáticamente
> por SSH al NAS Synology `ZAMBU-NAS`, ejecutar Docker y hacer rebuilds de los
> proyectos sin intervención manual del usuario.
>
> **Origen:** documento verificado y probado `BOTS_Traiding/docs/ConexionSSHnasConsola.md`
> (2026-08-01). Todo lo descrito aquí ya funciona.

## 0. Resumen para quien tenga prisa

- Conectar: `ssh nas-zambu` (alias ya configurado en la máquina de trabajo, ver §2).
- **Docker no está en el PATH**: hay que usar `sudo -n` + ruta completa
  (`/volume1/@appstore/ContainerManager/usr/bin/docker`), o el alias definido.
- Usar `docker-compose` (con guion), **no** `docker compose` (con espacio):
  este NAS solo tiene el binario clásico.
- **No hay `git` en el NAS**: el código se sincroniza con `tar` + `scp` (§5).
- Hay otros proyectos corriendo en el NAS (BuenChollo, OpenClaw, mediahunter-bot,
  bot_recomendador, honeygain, telegram-notifications): cuidar nombres de
  contenedor, puertos y redes para no chocar con ellos.
- El puerto `8000` del NAS está ocupado por un `nginx` interno de DSM (no Docker);
  usar otro puerto host si un proyecto necesita `8000`.
- `scp` necesita la opción `-O` (fuerza protocolo SCP clásico; este NAS rechaza el
  subsistema SFTP moderno).
- Principio general: acciones locales y reversibles se ejecutan sin pedir permiso;
  cualquier acción con impacto real (datos de producción, borrar volúmenes, tocar
  contenedores de otros proyectos) se confirma antes con el usuario.

## 1. Datos de conexión

| Campo                             | Valor                                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| Modelo NAS                        | Synology DS224+ (`ZAMBU-NAS`)                                        |
| Host                              | `192.168.1.3`                                                        |
| Puerto SSH                        | `32`                                                                 |
| Usuario                           | `adminzambu` (cuenta DSM `AdminZambu`, pertenece a `administrators`) |
| Clave privada (lado asistente/IA) | `~/.ssh/id_ed25519_nas`                                              |
| Alias SSH                         | `nas-zambu`                                                          |
| Binario Docker                    | `/volume1/@appstore/ContainerManager/usr/bin/docker`                 |
| Binario docker-compose            | `/volume1/@appstore/ContainerManager/usr/bin/docker-compose`         |
| Versión de Compose                | `v2.20.1` (binario clásico)                                          |

La clave privada vive en la máquina desde la que trabaja la IA. La clave pública ya
está autorizada en `~/.ssh/authorized_keys` del usuario en el NAS y el usuario tiene
`sudo` sin contraseña acotado a los dos binarios de Docker.

## 2. Configuración del cliente SSH (ya hecha en la máquina de trabajo)

En `~/.ssh/config` (de la máquina local desde la que trabaja la IA):

```
Host nas-zambu
    HostName 192.168.1.3
    Port 32
    User adminzambu
    IdentityFile ~/.ssh/id_ed25519_nas
    IdentitiesOnly yes
```

La clave se genera (una sola vez) con:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_nas -N "" -C "claude-code@bots-trading"
```

La clave pública se autoriza en el NAS por el usuario (nunca compartir la
contraseña con la IA). Requisito: el home del usuario SSH debe tener permisos
`755` (no `777`), o `sshd` con `StrictModes` rechaza la autenticación por clave.

El `sudo` acotado a Docker se configuró así (una única vez, con contraseña del
usuario):

```bash
echo 'AdminZambu ALL=(ALL) NOPASSWD: /volume1/@appstore/ContainerManager/usr/bin/docker, /volume1/@appstore/ContainerManager/usr/bin/docker-compose' | sudo tee /etc/sudoers.d/adminzambu-docker
sudo chmod 440 /etc/sudoers.d/adminzambu-docker
```

## 3. Verificar la conexión (siempre con BatchMode)

`BatchMode=yes` es obligatorio para una IA: si la clave falla, el comando falla al
instante en lugar de quedarse colgado pidiendo una contraseña que la IA no puede
escribir.

```bash
ssh -o BatchMode=yes nas-zambu "echo ok"
# Debe devolver: ok
```

Verificar que Docker responde sin contraseña:

```bash
ssh -o BatchMode=yes nas-zambu "sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker ps"
```

Si estos dos comandos fallan, **no continuar**: avisar al usuario, porque la clave
o el `sudo` se han desincronizado.

## 4. Docker en este NAS

- El binario `docker` no está en el `PATH` de una sesión SSH normal.
- No existe el subcomando `docker compose`; usar el binario `docker-compose`.
- El socket `/var/run/docker.sock` es solo-root; por eso se usa `sudo -n` con las
  rutas completas. Los alias de shell **no se cargan** en sesiones SSH no
  interactivas de la IA, por eso siempre usar rutas completas.

Definir en cada sesión (o comando):

```bash
DOCKER="sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker"
DC="sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker-compose"
```

Ejemplos:

```bash
ssh -o BatchMode=yes nas-zambu "$DOCKER ps"
ssh -o BatchMode=yes nas-zambu "$DOCKER ps -a"
ssh -o BatchMode=yes nas-zambu "$DOCKER logs --tail 100 <contenedor>"
```

## 5. Sincronizar código y hacer rebuild (no hay git en el NAS)

No hay binario `git` en el NAS. El flujo es **tar + scp + docker-compose build/up**.

### 5.1 Empaquetar y subir el código

Desde la máquina de trabajo, dentro del repo del proyecto:

```bash
TARBALL="/tmp/<proyecto>.tar.gz"
cd /ruta/al/repo && tar -czf "$TARBALL" \
  --exclude='.git' --exclude='node_modules' --exclude='dist' \
  --exclude='__pycache__' --exclude='.pytest_cache' \
  --exclude='.mypy_cache' --exclude='.ruff_cache' --exclude='.env' \
  --exclude='*.egg-info' .

scp -O -P 32 -i ~/.ssh/id_ed25519_nas "$TARBALL" adminzambu@192.168.1.3:~/
ssh -o BatchMode=yes nas-zambu "mkdir -p ~/<proyecto> && \
  tar -xzf ~/<proyecto>.tar.gz -C ~/<proyecto> && \
  rm ~/<proyecto>.tar.gz"
```

`scp -O` es imprescindible: sin `-O`, este NAS rechaza el subsistema SFTP moderno
con `subsystem request failed on channel 0`.

El `.env` se excluye del tar a propósito (contiene secretos). Si hace falta
actualizarlo, se sube por separado:

```bash
scp -O -P 32 -i ~/.ssh/id_ed25519_nas .env adminzambu@192.168.1.3:~/<proyecto>/.env
```

### 5.2 Rebuild y despliegue

```bash
DC="sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker-compose"

# 1. Construir imágenes (o solo las que cambiaron, ej: api web worker)
ssh -o BatchMode=yes nas-zambu "cd ~/<proyecto> && $DC build"

# 2. Levantar dependencias primero si el proyecto las usa (postgres, redis...)
ssh -o BatchMode=yes nas-zambu "cd ~/<proyecto> && $DC up -d postgres redis"

# 3. Levantar el resto del stack
ssh -o BatchMode=yes nas-zambu "cd ~/<proyecto> && $DC up -d"

# 4. Verificar estado y salud
ssh -o BatchMode=yes nas-zambu "cd ~/<proyecto> && $DC ps"
```

### 5.3 Receta completa de actualización (cambios en el código)

```bash
TARBALL="/tmp/<proyecto>.tar.gz"
cd /ruta/al/repo && tar -czf "$TARBALL" \
  --exclude='.git' --exclude='node_modules' --exclude='dist' \
  --exclude='__pycache__' --exclude='.pytest_cache' \
  --exclude='.mypy_cache' --exclude='.ruff_cache' --exclude='.env' \
  --exclude='*.egg-info' .

scp -O -P 32 -i ~/.ssh/id_ed25519_nas "$TARBALL" adminzambu@192.168.1.3:~/
ssh -o BatchMode=yes nas-zambu "cd ~/<proyecto> && \
  tar -xzf ~/<proyecto>.tar.gz && rm ~/<proyecto>.tar.gz"

DC="sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker-compose"
ssh -o BatchMode=yes nas-zambu "cd ~/<proyecto> && $DC build && $DC up -d"
```

## 6. Comandos operativos útiles

```bash
# Estado de los contenedores de un proyecto
ssh -o BatchMode=yes nas-zambu "$DOCKER ps --filter name=<proyecto>"

# Logs recientes de un contenedor
ssh -o BatchMode=yes nas-zambu "$DOCKER logs --tail 100 <proyecto>-api-1"

# Logs en vivo (cortar con Ctrl+C)
ssh -o BatchMode=yes nas-zambu "$DOCKER logs --follow --tail 100 <proyecto>-api-1"

# Reiniciar un contenedor
ssh -o BatchMode=yes nas-zambu "$DOCKER restart <contenedor>"

# Comprobar health de un contenedor
ssh -o BatchMode=yes nas-zambu "$DOCKER inspect --format='{{.State.Health.Status}}' <contenedor>"

# Ejecutar un comando dentro de un contenedor
ssh -o BatchMode=yes nas-zambu "$DOCKER exec <contenedor> <comando>"
```

## 7. Precauciones y trampas conocidas de este NAS

1. **Puerto `8000` ocupado**: un `nginx` interno de DSM escucha en
   `127.0.0.1:8000` (no es un contenedor). Si un servicio falla con
   `address already in use`, cambiar el puerto host vía variable de entorno
   (ej. `API_HOST_PORT=8020`). Verificar puertos con `$DOCKER ps` **y** con
   `wget -S -qO- --timeout=3 http://127.0.0.1:<puerto>/`, porque no todo lo que
   ocupa un puerto es visible como contenedor.
2. **No hay `git`**: nunca intentar `git clone`/`git pull` en el NAS.
3. **`docker-compose` con guion**, nunca `docker compose`.
4. **`scp -O`** obligatorio.
5. **No pegar claves/secretos en el chat ni en logs.** El `.env` nunca se sube
   con el tar; va por `scp` por separado y no se muestra su contenido.
6. **No tocar contenedores de otros proyectos** (BuenChollo, OpenClaw,
   mediahunter-bot, bot_recomendador, honeygain, telegram-notifications) sin
   confirmación del usuario.
7. **`COOKIE_SECURE`**: en proyectos con login sin HTTPS delante, `.env` usa
   `COOKIE_SECURE=false`; revertir a `true` solo cuando haya TLS real
   (Tailscale Serve) y reconstruir la imagen.

## 8. Si la conexión falla

1. Probar conectividad: `Test-NetConnection -ComputerName 192.168.1.3 -Port 32`.
2. Probar la clave en modo estricto: `ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_nas adminzambu@192.168.1.3 -p 32 "echo ok"`.
3. Comprobar que la clave pública sigue en `~/.ssh/authorized_keys` del NAS y que
   el home es `755`: `ssh -p 32 adminzambu@192.168.1.3 "ls -ld ~ ~/.ssh ~/.ssh/authorized_keys"`.
4. Comprobar el `sudo`: `ssh -o BatchMode=yes nas-zambu "sudo -n /volume1/@appstore/ContainerManager/usr/bin/docker ps"`.
5. Si algo falla, **parar y avisar al usuario**; nunca intentar adivinar
   contraseñas ni modificar permisos/sudoers del NAS por la cuenta del usuario.

## 9. Documentación original

Detalle completo del montaje (generación de claves, resolución de errores,
Tailscale Serve, retirada del proyecto BOTS_Traiding): `BOTS_Traiding/docs/ConexionSSHnasConsola.md`.
