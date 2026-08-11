import { NextRequest, NextResponse } from 'next/server';
import { readEnvKeys, writeEnvKeys } from '@/lib/env-keys.server';

// Without this, Next.js statically optimizes this route (no `request`
// param is read in GET), which freezes the GET response at build time and
// makes PUT return 405 in the standalone/production build.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await readEnvKeys());
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { data?: Record<string, string> };
    const incoming = body && typeof body.data === 'object' ? body.data : {};
    const existing = await readEnvKeys();
    const merged = { ...existing, ...incoming };
    await writeEnvKeys(merged);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
}
