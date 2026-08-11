# Referencia de la API local

Base URL predeterminada: `http://127.0.0.1:3000`.

Las rutas son internas a la aplicación, no una API pública multiusuario. Todas usan `force-dynamic` para evitar que Next.js congele respuestas o métodos durante el build standalone.

## `GET /api/keys`

Devuelve el mapa `id → secreto` leído desde `.env`.

```json
{
  "openai": "<secreto>",
  "deepseek": "<secreto o JSON de sesión>"
}
```

La UI usa este endpoint para hidratar conexiones. No debe exponerse fuera de localhost.

## `PUT /api/keys`

Fusiona los valores recibidos con el mapa existente.

```json
{
  "data": {
    "provider-id": "<secreto>"
  }
}
```

Respuesta correcta: `{ "ok": true }`. Payload inválido: HTTP 400.

## `POST /api/usage`

```json
{
  "id": "openai",
  "provider": "openai"
}
```

Flujo:

1. valida `id` y `provider`;
2. comprueba que el proveedor implemente consulta;
3. lee el secreto por `id`;
4. ejecuta el fetcher correspondiente;
5. devuelve `ApiUsageSnapshot`.

Errores habituales:

- `400`: payload o secreto ausente;
- `501`: proveedor personalizado no implementado;
- `502`: error del proveedor, autenticación, timeout o scraping.

## `POST /api/auth/browser-login`

### Iniciar

```json
{
  "action": "start",
  "providerId": "claude-pro",
  "provider": "claude-pro"
}
```

Devuelve `{ "sessionId": "..." }`.

### Forzar detección

```json
{
  "action": "force_check",
  "sessionId": "..."
}
```

### Cancelar

```json
{
  "action": "cancel",
  "sessionId": "..."
}
```

## `GET /api/auth/browser-login?sessionId=...`

Devuelve:

```json
{
  "status": "waiting_user_login",
  "statusMessage": "...",
  "usageSnapshot": null,
  "error": null
}
```

Estados: `starting`, `waiting_user_login`, `extracting`, `completed`, `cancelled` y `error`.

## Consideraciones de seguridad

- El servidor escucha sólo en `127.0.0.1` por defecto.
- No existe autenticación adicional en la API local.
- No cambies `DASHBOARD_HOST` a una interfaz de red sin añadir primero autenticación y protección CSRF/origen.
- No registres cuerpos de `/api/keys` ni secretos de `/api/usage`.
