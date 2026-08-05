import { ApiUsageSnapshot } from '@/types/api';

interface DeepSeekBalanceInfo {
  currency: 'USD' | 'CNY';
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

interface DeepSeekBalanceResponse {
  is_available: boolean;
  balance_infos: DeepSeekBalanceInfo[];
}

export async function fetchDeepSeekUsage(apiKey: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();

  const res = await fetch('https://api.deepseek.com/user/balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek API ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }

  const data = (await res.json()) as DeepSeekBalanceResponse;
  const info = data.balance_infos?.[0];

  return {
    fetchedAt,
    balance: info ? Number(info.total_balance) : undefined,
    currency: info?.currency,
    // El endpoint publico de DeepSeek solo da saldo; coste/tokens/peticiones
    // solo estan disponibles en su panel web (platform.deepseek.com).
    unavailable: ['accumulatedCost', 'tokensUsed', 'requestCount'],
  };
}
