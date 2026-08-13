import { NextRequest, NextResponse } from 'next/server';
import { deleteEnvKeys, readEnvKeys, writeEnvKeys } from '@/lib/env-keys.server';

// Without this, Next.js statically optimizes this route (no `request`
// param is read in GET), which freezes the GET response at build time and
// makes PUT return 405 in the standalone/production build.
export const dynamic = 'force-dynamic';

export async function GET() {
  const keys = await readEnvKeys();
  return NextResponse.json({ configuredIds: Object.keys(keys).sort() });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { data?: Record<string, string> };
    const candidate = body && typeof body.data === 'object' ? body.data : {};
    const incoming = Object.fromEntries(
      Object.entries(candidate).filter(([id, value]) => /^[a-z0-9][a-z0-9-]{0,127}$/i.test(id) && typeof value === 'string' && value.length > 0 && value.length <= 250000)
    );
    if (Object.keys(incoming).length !== Object.keys(candidate).length) {
      return NextResponse.json({ ok: false, error: 'Credencial o identificador invÃ¡lido.' }, { status: 400 });
    }
    const existing = await readEnvKeys();
    const merged = { ...existing, ...incoming };
    await writeEnvKeys(merged);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { ids?: string[] };
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/i.test(id))
      : [];
    if (ids.length) await deleteEnvKeys(ids);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
}
