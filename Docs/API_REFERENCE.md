# Referencia de la API local

Base predeterminada: `http://127.0.0.1:3000`. Es una API interna de una aplicación monousuario, no un servicio público. Las rutas de configuración, credenciales, uso y login son `force-dynamic`.

## `GET /api/config`

Devuelve proveedores sanitizados y preferencias. Nunca incluye secretos.

```json
{
  "providers": [{ "id": "openai", "provider": "openai", "apiKey": "", "connected": true }],
  "preferences": { "widgetOpacity": 92, "refreshWidgetSeconds": 300 }
}
```

## `PUT /api/config`

Acepta `providers`, `preferences` o ambos. Valida cantidad, IDs, nombres, proveedor, opacidad e intervalo. Fuerza `apiKey: ""` antes de persistir.

## `GET /api/keys`

Devuelve solo presencia de credenciales:

```json
{ "configuredIds": ["claude-pro", "openai"] }
```

El valor cifrado nunca se devuelve al dashboard ni al widget.

## `PUT /api/keys`

```json
{ "data": { "provider-id": "<secreto>" } }
```

Fusiona credenciales tras validar ID, tipo y tamaño. En Electron, el broker vuelve a validar y cifra mediante DPAPI.

## `DELETE /api/keys`

```json
{ "ids": ["provider-id"] }
```

Elimina las credenciales indicadas.

## `POST /api/usage`

```json
{ "id": "openai", "provider": "openai" }
```

La ruta comprueba que la integración exista y que el ID corresponda al proveedor solicitado antes de recuperar el secreto. Devuelve `ApiUsageSnapshot` o un error en español.

- `400`: payload, integración o credencial inválida/ausente.
- `501`: proveedor sin consulta implementada.
- `502`: error del proveedor, autenticación, timeout o scraping.

## Login web

`POST /api/auth/browser-login` admite `start`, `force_check` y `cancel`. `GET /api/auth/browser-login?sessionId=...` devuelve estado, mensaje, snapshot y error. Nunca devuelve el secreto capturado.

Estados: `starting`, `waiting_user_login`, `extracting`, `completed`, `cancelled`, `error`.

## Seguridad

- Solo loopback.
- Sin CORS abierto.
- Cuerpos secretos no se registran.
- Fetches internos y respuestas sensibles usan `no-store`.
- No cambies el host a una interfaz de red sin autenticación, protección de origen/CSRF y revisión específica.
