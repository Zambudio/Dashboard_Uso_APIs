# AGENTS.md

Dashboard (Next.js 14 App Router) to track real usage/cost of AI API providers (OpenAI, Anthropic, DeepSeek) plus Claude Pro subscription usage %. UI text is in **Spanish**. Ships as a standalone Windows `.exe` — see [README.md](./README.md) for the packaging story.

## Architecture

- Almost everything is `'use client'`; server-side pieces are `app/api/keys/route.ts` and `app/api/usage/route.ts` (App Router route handlers).
- Single page: `app/page.tsx` holds all state/logic. `components/` are presentational panels; `types/api.ts` defines the domain types; `lib/storage.ts` is client-side persistence + the `/api/usage` caller.
- **No mock data.** Every number shown comes from a real provider API call, or is explicitly marked unavailable/never-fetched in the UI. Don't reintroduce `Math.random()`/hardcoded balances — that was the state before this was fixed and it's exactly what this rewrite removed.
- **Provider model** (`types/api.ts`): `ApiProviderConfig.kind` is `'api'` (pay-per-token, has balance/cost/tokens) or `'subscription'` (Claude Pro, has session/weekly utilization %). `lib/providers.ts` (`PROVIDER_DEFINITIONS`) is the single source of truth per provider: which secret it needs (API key vs Admin key vs session cookie), help text, and whether `/api/usage` has a real implementation (`usageImplemented`). Check this file before assuming a provider is wired up.
- **Secrets**: not in `localStorage`. `lib/storage.ts` sends them to `PUT /api/keys` → `lib/env-keys.server.ts` writes them into a local `.env` file as `DASHBOARD_PROVIDER_KEYS=<base64 JSON id→secret>` (obfuscation, not encryption). `loadEnvKeys()` reads them back via `GET /api/keys` on page load. Path resolved via `DASHBOARD_ENV_FILE` env var, falling back to `cwd()/.env`.
  - Both `app/api/keys/route.ts` and `app/api/usage/route.ts` have `export const dynamic = 'force-dynamic'` — without it Next statically optimizes the GET at build time (since it doesn't read `request`) and the standalone/production build serves stale data + 405s on mutating verbs. Don't remove it.
- **Usage fetchers** (`lib/usage/*.server.ts`), dispatched by `app/api/usage/route.ts` based on `provider`:
  - `deepseek.server.ts` — `GET /user/balance` with the normal API key. Only balance is public; cost/tokens/requests are marked `unavailable` (DeepSeek doesn't expose them outside their web console).
  - `openai.server.ts` — `/v1/organization/usage/completions` + `/v1/organization/costs`, both **require an Admin API key** (org-level), not the regular project key.
  - `anthropic.server.ts` — `/v1/organizations/usage_report/messages` + `/cost_report`, both **require an Admin API key** (`sk-ant-admin01-...`). Cost amounts come back in cents as decimal strings — divide by 100.
  - `claude-pro.server.ts` — no public API exists for Claude Pro subscription usage. Mirrors [claude-usage-widget](https://github.com/SlavomirDurej/claude-usage-widget): launches headless Chromium via `playwright`, injects the user's `sessionKey` cookie, hits claude.ai's **internal, undocumented** `api/organizations/{id}/usage` endpoint (a real browser engine is required — Cloudflare blocks plain HTTP requests). Auto-installs Chromium on first use (see Packaging).
- Non-secret config/preferences still live in `localStorage` via `lib/storage.ts` (`ai-api-dashboard-config`, `ai-api-dashboard-preferences`, base64 `btoa/atob`, not encryption).
- Path alias `@/*` → repo root (tsconfig `paths`).
- `next.config.js` has `output: 'standalone'` for the exe packaging (see below).

## Packaging (`dashboard.exe`)

- `launcher.js` — packaged by `pkg` on its own (no assets). At runtime it spawns `server-entry.js` (not `standalone/server.js` directly — see below) as a child process, using the `PKG_EXECPATH=PKG_INVOKE_NODEJS` trick so the exe's embedded Node runtime runs it like a normal `node <script>`. Then polls the port and opens the browser.
- `scripts/build-exe.js` — `next build` output lives in `.next/standalone`; this copies it (plus `.next/static` and `public/`, which standalone output doesn't include on its own) to `dist/standalone/`, overwrites `node_modules/playwright{,-core}` with the full packages (see below), then runs `pkg` on `launcher.js` only, into `dist/dashboard.exe`. Also copies `inspector-shim.js` and `server-entry.js` into `dist/`.
- Do **not** try to embed the Next build inside the `pkg` snapshot via `pkg.assets` — `@yao-pkg/pkg` 6.22 doesn't reliably include large generated trees (`.next/BUILD_ID` etc. end up missing at runtime). The external-folder approach above is the fix; see README for the full story.
- **`ERR_INSPECTOR_NOT_AVAILABLE`**: pkg's bundled Node has no `inspector` module. Next's fetch tracer `require('inspector')`s unconditionally at module load the first time any route does a server-side `fetch()` (i.e. `/api/usage`), which crashes the packaged exe (worked fine in `next dev`/`next start`, which use a real Node binary). pkg's runtime also rejects `--require`/`NODE_OPTIONS` outright (`ERR_INTERNAL_ASSERTION`), so the usual preload fix doesn't work either. Fixed with `inspector-shim.js` (monkeypatches `Module._load` to stub `inspector`) required by `server-entry.js` *before* `standalone/server.js`, all in one process — `launcher.js` spawns `server-entry.js`, never `standalone/server.js` directly. Keep this load order if the entry point ever changes.
- **Chromium for Claude Pro is not bundled** — it's ~300MB with a single 285MB file, which GitHub rejects outright on a normal `git push` (>100MB/file limit). `lib/usage/claude-pro.server.ts` auto-installs it on first use via `playwright/cli.js install chromium` (needs internet, downloads to the standard Playwright OS cache — not project-relative, so it's shared across runs/reinstalls). Next's output tracing misses `playwright/cli.js` (referenced by a runtime-built path, not a static import) — that's why `build-exe.js` force-copies the full `playwright`/`playwright-core` packages over the standalone `node_modules`.
- `scripts/sign-exe.ps1` — optional Authenticode signing with a local self-signed cert. Does not satisfy Smart App Control (no cloud reputation); only useful for local integrity/SmartScreen on machines that import the cert.

## Commands

- `npm run dev` — dev server
- `npm run build` / `npm run start` — prod (note: `next start` warns and doesn't fully honor `output: standalone`; for production-accurate testing run `node .next/standalone/server.js` directly, or build the exe)
- `npm run lint` — `next lint`
- `npm run exe` — build + package `dist/dashboard.exe` (Windows only, needs `@yao-pkg/pkg`)
- No test framework is configured.

## Gotchas

- **Repo sits on a NAS share** (`\\Zambu-nas`, mounted `N:`/`Z:` depending on machine). `next.config.js` sets `experimental.outputFileTracingRoot: __dirname` to help. In practice `npm run build` has worked fine directly on the mapped drive letter; if it doesn't on a given machine, fall back to building from a local `C:` copy and copying `dist/` back.
- Windows will likely block the unsigned `dashboard.exe` on first run (SmartScreen and/or Smart App Control). This is expected — see README's "Aviso de seguridad de Windows" section, not a code bug.
- After building `dist/`, deleting it immediately sometimes hits `EPERM` (AV scanning the fresh exe) — retry once, it clears on its own.
- OpenAI/Anthropic usage needs an **Admin API key**, not the regular key — a normal `sk-...`/`sk-ant-...` key will 401/403 against these endpoints. Only an org owner can generate one.
- Claude Pro's `sessionKey` cookie is a full account session token, not scoped to usage — treat it as more sensitive than an API key in any future code touching it.
