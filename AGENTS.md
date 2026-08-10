# AGENTS.md

Dashboard (Next.js 14 App Router) para trackear uso, coste y límites en tiempo real de proveedores de IA: **Anthropic Claude (Pro y API)**, **OpenAI (ChatGPT Plus y API)**, **Google Gemini (Pro/Advanced)** y **DeepSeek (Web Console y API)**. La interfaz y los textos están en **español**. Se empaqueta como `.exe` autónomo para Windows — ver [README.md](./README.md).

## Arquitectura

- Casi todo corre en el cliente (`'use client'`); los puntos de servidor son las rutas de la App Router: `app/api/keys/route.ts`, `app/api/usage/route.ts` y `app/api/browser-login/route.ts`.
- Página única: `app/page.tsx` gestiona el estado y la sincronización. `components/` contiene paneles visuales (`ProviderCard.tsx`, `BrowserLoginModal.tsx`, `DonutProgress.tsx`), `types/api.ts` define los modelos de datos y `lib/storage.ts` gestiona la persistencia cliente y las llamadas API.
- **Sin datos simulados (No mock data)**: Cada métrica mostrada proviene de una llamada real al proveedor o de la lectura en tiempo real de la consola oficial.

### Modelo de Proveedores y Conexión (`lib/providers.ts`)

- `ApiProviderConfig.kind`:
  - `'subscription'`: Para cuentas de consumo/planes Pro (Claude Pro, ChatGPT Plus, Google Gemini). Muestran gráficos donut de porcentaje de uso semanal, sesión actual y temporizadores de reseteo.
  - `'api'`: Para APIs por consumo (DeepSeek, OpenAI API, Anthropic API). Muestran saldo, coste acumulado, tokens y número de peticiones.

### Sistema de Inicio de Sesión Web Interactivo (`lib/browser-login.server.ts`)

Gestiona sesiones de Chromium automatizadas e interactivas con Playwright:
- **Stealth y evasión de bloqueos**: Enmascara `navigator.webdriver`, propiedades de Chrome runtime, plugins e idiomas para permitir inicios de sesión OAuth (como Google Sign-In) sin bloqueos de seguridad.
- **Flujos específicos por proveedor**:
  - `setupClaudeLogin`: Navega a `claude.ai`, extrae `sessionKey` y consulta la API interna de consumo (`api/organizations/{id}/usage`).
  - `setupOpenAILogin`: Navega a `chatgpt.com`, extrae el token de sesión y consulta `chatgpt.com/backend-api/wham/usage`.
  - `setupGeminiLogin`: Navega a `gemini.google.com`, extrae los límites de uso actual y semanal del menú oficial de Gemini.
  - `setupDeepSeekLogin`: Navega a `platform.deepseek.com/usage`, extrae el saldo recargado, coste total acumulado, tokens consumidos y número de peticiones mediante lectura directa línea por línea del DOM.

### Almacenamiento de Credenciales (`lib/env-keys.server.ts`)

- Las claves y cookies nunca se guardan en `localStorage`.
- Se persisten mediante `PUT /api/keys` en el archivo local `.env` como `DASHBOARD_PROVIDER_KEYS=<base64 JSON id→secreto>`.
- Las rutas `app/api/keys/route.ts` y `app/api/usage/route.ts` cuentan con `export const dynamic = 'force-dynamic'` para evitar compilaciones estáticas de Next.js.

## Comandos

- `npm run dev` — Servidor de desarrollo
- `npm run build` / `npm run start` — Compilación y ejecución de producción
- `npm run lint` — Verificación con ESLint
- `npm run exe` — Compilación y empaquetado del binario `dist/dashboard.exe` para Windows
