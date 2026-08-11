# Operación y resolución de problemas

## Operación diaria

1. Ejecuta `DashboardTray.exe`.
2. Espera al icono verde.
3. Abre el panel con doble clic.
4. Usa **Actualizar** en una tarjeta cuando necesites una lectura nueva.
5. Para cerrar realmente el servidor, usa clic derecho → **Salir**. Cerrar la pestaña del navegador no detiene la aplicación.

## El icono no aparece

- Abre el menú `^` de iconos ocultos.
- Comprueba que `DashboardTray.exe` sigue en el Administrador de tareas.
- Verifica que el archivo está junto a `dashboard.exe`.
- Revisa políticas corporativas de ejecución desde unidades de red.

## Icono rojo o dashboard inaccesible

1. Clic derecho → **Reiniciar servidor**.
2. Comprueba `http://127.0.0.1:3000`.
3. Revisa si otro proceso usa el puerto:

   ```powershell
   Get-NetTCPConnection -State Listen -LocalPort 3000
   ```

4. Si el puerto pertenece a otra aplicación, ciérrala o ajusta la configuración. El lanzador de bandeja actual espera específicamente `127.0.0.1:3000`.

## Se abre una consola

El usuario final debe ejecutar `DashboardTray.exe`, no `dashboard.exe`, `npm run dev` ni `server-entry.js`.

## Faltan logos o la página está incompleta

La carpeta `dist/standalone/public/` y `dist/standalone/.next/static/` deben existir. Vuelve a copiar `dist/` completa o regenera con `npm run exe`.

## Falta `standalone/server.js`

Se copió sólo el ejecutable. Recupera la carpeta `dist/` completa.

## Chromium no está instalado

La primera conexión de Claude o DeepSeek intenta instalarlo automáticamente. Si falla en un entorno de desarrollo:

```powershell
npx playwright install chromium
```

En un PC sin npm, revisa acceso a Internet/proxy y ejecuta nuevamente la conexión desde el paquete; el paquete incluye la CLI de Playwright.

## Desarrollo en NAS: Watchpack, EPERM o servidor que no responde

Síntomas:

- puerto 3000 escuchando pero peticiones bloqueadas;
- `Watchpack Error ... unknown error, watch`;
- `EPERM ... .next/package.json`;
- acceso denegado a `.next/trace`.

Solución: mueve el checkout a un disco local NTFS para `npm run dev` o `npm run build`. El ejecutable standalone sí puede residir en la unidad compartida si tiene permisos de lectura/escritura.

## Errores por proveedor

| Mensaje | Acción |
|---|---|
| 401/403 OpenAI | Usa Admin API Key o login web; una Project Key no lee costes. |
| 401/403 Anthropic | Usa Admin API Key o sesión Claude. |
| Sesión DeepSeek caducada | Pulsa **Iniciar sesión web**; mientras tanto puede mostrarse el snapshot guardado. |
| No se encontró organización Claude | Reconecta Claude y confirma que la cuenta tiene organización/plan accesible. |
| Cloudflare / reto JS | Reintenta más tarde desde una red y sesión legítimas. |
| Gemini sin métricas | Una API key sólo valida acceso; usa login web para límites de la suscripción. |

## El navegador no se abre

- Doble clic en el icono verde o usa **Abrir dashboard**.
- Comprueba que Windows tenga navegador predeterminado.
- Abre manualmente `http://127.0.0.1:3000`.

## Recuperación de credenciales

Si `dist/.env` se pierde no hay recuperación automática. Restaura una copia privada o vuelve a conectar cada proveedor. Si se expone, revoca todas las claves/sesiones antes de crear un archivo nuevo.
