import { NextRequest, NextResponse } from 'next/server';
import { ProviderKey } from '@/types/api';
import { startBrowserLogin, getBrowserLoginStatus, cancelBrowserLogin, forceCheckSession } from '@/lib/browser-login.server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { action?: 'start' | 'cancel' | 'force_check'; providerId?: string; provider?: ProviderKey; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const { action, providerId, provider, sessionId } = body;

  if (action === 'start') {
    if (!providerId || !provider) {
      return NextResponse.json({ error: 'Falta providerId o provider' }, { status: 400 });
    }
    try {
      const result = await startBrowserLogin(providerId, provider);
      return NextResponse.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar navegador';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === 'force_check') {
    if (!sessionId) {
      return NextResponse.json({ error: 'Falta sessionId' }, { status: 400 });
    }
    const result = await forceCheckSession(sessionId);
    return NextResponse.json(result);
  }

  if (action === 'cancel') {
    if (!sessionId) {
      return NextResponse.json({ error: 'Falta sessionId' }, { status: 400 });
    }
    await cancelBrowserLogin(sessionId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Falta sessionId' }, { status: 400 });
  }

  const status = getBrowserLoginStatus(sessionId);
  return NextResponse.json(status);
}
