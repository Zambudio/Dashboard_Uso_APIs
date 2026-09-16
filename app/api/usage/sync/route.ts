import { NextRequest, NextResponse } from 'next/server';
import { ApiUsageSnapshot, ProviderKey } from '@/types/api';
import { getSyncedSnapshot, readSyncedCache, saveSyncedSnapshot } from '@/lib/synced-cache.server';

export const dynamic = 'force-dynamic';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get('id');

  if (providerId) {
    const entry = getSyncedSnapshot(providerId);
    return NextResponse.json(entry || { error: 'Not found' }, {
      status: entry ? 200 : 404,
      headers: corsHeaders(),
    });
  }

  const cache = readSyncedCache();
  return NextResponse.json(cache, {
    status: 200,
    headers: corsHeaders(),
  });
}

interface SyncPayload {
  providerId?: string;
  provider: ProviderKey;
  snapshot?: ApiUsageSnapshot;
  // Fallback if flat snapshot passed
  sessionUtilization?: number;
  weeklyUtilization?: number;
  sessionResetsAt?: string;
  weeklyResetsAt?: string;
  balance?: number;
  currency?: string;
  accumulatedCost?: number;
  tokensUsed?: number;
  requestCount?: number;
  planType?: string;
  tier?: string;
}

export async function POST(request: NextRequest) {
  let body: SyncPayload;
  try {
    body = (await request.json()) as SyncPayload;
  } catch {
    return NextResponse.json(
      { error: 'Formato JSON inválido' },
      { status: 400, headers: corsHeaders() }
    );
  }

  const provider = body.provider;
  if (!provider) {
    return NextResponse.json(
      { error: 'Campo "provider" obligatorio' },
      { status: 400, headers: corsHeaders() }
    );
  }

  const providerId = body.providerId || provider;

  let snapshot: ApiUsageSnapshot;
  if (body.snapshot) {
    snapshot = body.snapshot;
  } else {
    snapshot = {
      fetchedAt: new Date().toISOString(),
      sessionUtilization: body.sessionUtilization,
      weeklyUtilization: body.weeklyUtilization,
      sessionResetsAt: body.sessionResetsAt,
      weeklyResetsAt: body.weeklyResetsAt,
      balance: body.balance,
      currency: body.currency,
      accumulatedCost: body.accumulatedCost,
      tokensUsed: body.tokensUsed,
      requestCount: body.requestCount,
      planType: body.planType,
      tier: body.tier,
    };
  }

  const saved = saveSyncedSnapshot(providerId, provider, snapshot);

  return NextResponse.json(
    { success: true, message: `Uso de ${provider} sincronizado con éxito`, saved },
    { status: 200, headers: corsHeaders() }
  );
}
