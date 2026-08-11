import { NextRequest, NextResponse } from 'next/server';
import { readEnvVar, writeEnvVar } from '@/lib/env-keys.server';
import { ApiProviderConfig, DashboardPreferences } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers = readEnvVar<ApiProviderConfig[] | null>('DASHBOARD_CONFIG', null);
  const preferences = readEnvVar<DashboardPreferences | null>('DASHBOARD_PREFERENCES', null);
  return NextResponse.json({ providers, preferences });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.providers !== undefined) {
      writeEnvVar('DASHBOARD_CONFIG', body.providers);
    }
    if (body.preferences !== undefined) {
      writeEnvVar('DASHBOARD_PREFERENCES', body.preferences);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }
}
