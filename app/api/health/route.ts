import { NextResponse } from 'next/server';
import { resolveBrokerConfig } from '@/lib/cred-broker-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const broker = resolveBrokerConfig(process.env);
  return NextResponse.json(
    { ok: true, mode: broker ? 'electron' : 'web-dev' },
    { headers: { 'Cache-Control': 'no-store', 'Surrogate-Control': 'no-store' } }
  );
}
