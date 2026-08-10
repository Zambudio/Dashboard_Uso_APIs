import { ApiUsageSnapshot } from '@/types/api';

export async function fetchGeminiUsage(apiKey: string): Promise<ApiUsageSnapshot> {
  const fetchedAt = new Date().toISOString();

  // If the key looks like a JSON session snapshot or token
  if (apiKey.startsWith('{')) {
    try {
      const parsed = JSON.parse(apiKey) as {
        apiKey?: string;
        cachedSnapshot?: ApiUsageSnapshot;
        planType?: string;
        tier?: string;
      };
      if (parsed.cachedSnapshot) {
        return {
          ...parsed.cachedSnapshot,
          fetchedAt,
        };
      }
      if (parsed.apiKey) {
        apiKey = parsed.apiKey;
      }
    } catch {
      // Not JSON, continue with raw key
    }
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let msg = `Google Gemini API ${res.status}: ${res.statusText}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) {
        msg = errJson.error.message;
      }
    } catch {
      if (errText) msg = errText.slice(0, 200);
    }
    throw new Error(msg);
  }

  // La API de AI Studio no expone cuota, límites ni uso para una API Key de pago por uso;
  // esta llamada solo sirve para validar que la clave es correcta. Para ver límites reales
  // de Gemini Advanced/Pro hay que usar "Iniciar sesión web".
  await res.json();

  return {
    fetchedAt,
    planType: 'Google AI Studio (API Key)',
    unavailable: ['balance', 'accumulatedCost', 'tokensUsed', 'requestCount', 'sessionUtilization', 'weeklyUtilization'],
  };
}
