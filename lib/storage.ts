'use client';

import { ApiProviderConfig, ApiUsageSnapshot, DashboardPreferences, ProviderKey } from '@/types/api';

const CONFIG_ENDPOINT = '/api/config';
const KEYS_ENDPOINT = '/api/keys';
const USAGE_ENDPOINT = '/api/usage';

export async function fetchProviderUsage(id: string, provider: ProviderKey): Promise<ApiUsageSnapshot> {
  try {
    const res = await fetch(USAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, provider }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { fetchedAt: new Date().toISOString(), error: data?.error ?? `Error HTTP ${res.status}` };
    }
    return data as ApiUsageSnapshot;
  } catch (err) {
    return { fetchedAt: new Date().toISOString(), error: err instanceof Error ? err.message : 'Error de red consultando el proveedor.' };
  }
}

/** Devuelve solo presencia/ausencia. Los valores secretos nunca salen del servidor. */
export async function fetchCredentialStatus(): Promise<Set<string>> {
  try {
    const res = await fetch(KEYS_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) return new Set();
    const data = (await res.json()) as { configuredIds?: unknown };
    const ids = Array.isArray(data.configuredIds)
      ? data.configuredIds.filter((id): id is string => typeof id === 'string')
      : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export async function saveProviderCredential(id: string, secret: string): Promise<void> {
  const res = await fetch(KEYS_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { [id]: secret } }),
  });
  if (!res.ok) throw new Error('No se pudo guardar la credencial en el almacÃ©n seguro.');
}

export async function deleteProviderCredentials(ids: string[]): Promise<void> {
  const res = await fetch(KEYS_ENDPOINT, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('No se pudo eliminar la credencial del almacÃ©n seguro.');
}

export async function fetchServerConfig(): Promise<{
  providers: ApiProviderConfig[] | null;
  preferences: DashboardPreferences | null;
}> {
  try {
    const res = await fetch(CONFIG_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) return { providers: null, preferences: null };
    return await res.json();
  } catch {
    return { providers: null, preferences: null };
  }
}

async function saveServerConfig(data: {
  providers?: ApiProviderConfig[];
  preferences?: DashboardPreferences;
}): Promise<void> {
  const res = await fetch(CONFIG_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('No se pudo guardar la configuraciÃ³n local.');
}

export function saveProviders(providers: ApiProviderConfig[]): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const sanitized = providers.map((provider) => ({ ...provider, apiKey: '' }));
  return saveServerConfig({ providers: sanitized });
}

export function savePreferences(preferences: DashboardPreferences): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return saveServerConfig({ preferences });
}
