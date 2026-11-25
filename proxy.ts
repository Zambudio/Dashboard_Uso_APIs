import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { evaluateRequest, resolveAuthConfig } from '@/lib/dashboard-auth';

// Autenticación del servidor cuando se expone fuera de localhost (Docker).
// Sin DASHBOARD_AUTH_TOKEN ni DASHBOARD_REQUIRE_AUTH no hace nada, por lo que
// el widget Electron (127.0.0.1) y `npm run dev` no cambian. Ver
// lib/dashboard-auth.js y Docs/DOCKER.md.
let warnedMisconfigured = false;

export function proxy(request: NextRequest) {
  const config = resolveAuthConfig(process.env);
  if (config.mode === 'misconfigured' && !warnedMisconfigured) {
    warnedMisconfigured = true;
    console.error(`[auth] ${config.reason}`);
  }

  const decision = evaluateRequest(
    {
      method: request.method,
      pathname: request.nextUrl.pathname,
      authorization: request.headers.get('authorization'),
    },
    config
  );
  if (decision.allow) return NextResponse.next();
  return NextResponse.json(decision.body, { status: decision.status, headers: decision.headers });
}
