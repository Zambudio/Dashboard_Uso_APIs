# Proveedores y métricas

## Matriz de capacidades

| Proveedor | Conexión | Fuente real | Métricas principales | Limitaciones |
|---|---|---|---|---|
| OpenAI / ChatGPT | Admin API Key o sesión web | API de organización y endpoints autenticados de ChatGPT | Coste, tokens, peticiones o porcentaje semanal según credencial | Una `sk-proj-*` no puede leer costes de organización. |
| Anthropic Claude API | Admin API Key o sesión Claude | Usage/Cost Report API o sesión Claude | Tokens, coste o límites de sesión/semanales | Las claves estándar `sk-ant-api*` no tienen permisos de informes. |
| Claude Pro / Code | Cookie `sessionKey` o login web | API interna de organizaciones de `claude.ai` | Uso de 5 h, uso semanal y resets | Cookie expirable; puede haber bloqueo Cloudflare. |
| Google Gemini | API Key o login web | Validación de AI Studio o límites visibles de Gemini | Validez de key o límites actual/semanal | AI Studio no expone consumo o cuota por API key mediante este flujo. |
| DeepSeek | API Key o login web | API oficial de saldo y DOM de la consola Usage | Saldo, coste, tokens y peticiones | Coste/tokens/peticiones requieren sesión web; se puede mostrar el último snapshot si caduca. |
| Personalizado | API Key | Ninguna | Sólo almacenamiento de configuración | Consulta automática no implementada (`501`). |

## Normalización

Todos los fetchers devuelven `ApiUsageSnapshot`:

- `balance`, `grantedBalance`, `toppedUpBalance`;
- `accumulatedCost`, `tokensUsed`, `requestCount`;
- `sessionUtilization`, `weeklyUtilization`;
- `sessionResetsAt`, `weeklyResetsAt`;
- `planType`, `tier`, `currency`;
- `unavailable` para datos que la fuente no ofrece;
- `error` para fallos recuperables mostrados en la tarjeta.

Los totales superiores suman únicamente `balance` y `accumulatedCost` presentes. No convierten divisas ni estiman campos ausentes.

## OpenAI

- Una sesión web puede almacenar cookies/tokens y un snapshot de ChatGPT Plus.
- El flujo intenta obtener límites semanales desde `chatgpt.com/backend-api/wham/usage`.
- Una Admin API Key permite consultar costes y uso de la organización durante siete días.
- Respuestas 401/403 se traducen a instrucciones para usar una clave administrativa o reconectar.

## Anthropic y Claude

- `anthropic` acepta Admin API Key, `sessionKey` o un JSON generado por el login web.
- Si el secreto representa una sesión Claude, reutiliza `fetchClaudeProUsage`.
- Claude consulta primero las organizaciones y después `/api/organizations/{id}/usage`.
- Los porcentajes se muestran tal como los devuelve el proveedor.

## Gemini

- Una API Key se valida consultando la lista de modelos, pero no produce métricas inventadas.
- El login web captura un snapshot de los límites visibles en la interfaz de Gemini.
- Los cambios en el DOM de Gemini pueden requerir adaptar `setupGeminiLogin`.

## DeepSeek

- La API pública se usa para el saldo cuando existe una `sk-*` válida.
- La consola se reconstruye con cookies y `localStorage` para leer datos en vivo.
- Las cookies se aplican en bloque y después individualmente si alguna es incompatible.
- Si la sesión web expira y existe `cachedSnapshot`, se conserva el último dato con una advertencia explícita.

## Regla de datos reales

No se deben añadir mocks, valores de demostración, conversiones asumidas ni estimaciones como si fueran datos reales. Para un campo no disponible, usa `unavailable`; para una integración aún no implementada, devuelve `501`.
