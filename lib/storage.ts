'use client';

import { ApiProviderConfig, ApiUsageSnapshot, DashboardPreferences, ProviderKey } from '@/types/api';

const STORAGE_KEY = 'ai-api-dashboard-config';
const PREFS_KEY = 'ai-api-dashboard-preferences';
const KEYS_ENDPOINT = '/api/keys';
const USAGE_ENDPOINT = '/api/usage';

/**
 * btoa()/atob() solo soportan Latin1: revientan con InvalidCharacterError ante
 * cualquier carácter fuera de ese rango (tildes con code point >255, rayas "—",
 * texto capturado de páginas de proveedores, etc.). Codificamos a UTF-8 primero.
 */
function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

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

async function fetchEnvKeys(): Promise<Record<string, string>> {
  try {
    const res = await fetch(KEYS_ENDPOINT);
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === 'object' ? (data as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function saveEnvKeys(keys: Record<string, string>): Promise<void> {
  try {
    await fetch(KEYS_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: keys }),
    });
  } catch {
    // Ignore: the local .env stays untouched if the server is unavailable.
  }
}

export async function loadEnvKeys(): Promise<Record<string, string>> {
  return fetchEnvKeys();
}

export function saveProviders(providers: ApiProviderConfig[]) {
  if (typeof window === 'undefined') return;

  const keys: Record<string, string> = {};
  const sanitized = providers.map((provider) => {
    if (provider.apiKey) {
      keys[provider.id] = provider.apiKey;
    }
    return { ...provider, apiKey: '' };
  });

  window.localStorage.setItem(STORAGE_KEY, toBase64(JSON.stringify(sanitized)));
  void saveEnvKeys(keys);
}

export function loadProviders(): ApiProviderConfig[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(fromBase64(raw)) as ApiProviderConfig[];
  } catch {
    return [];
  }
}

export function savePreferences(preferences: DashboardPreferences) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_KEY, toBase64(JSON.stringify(preferences)));
}

export function loadPreferences(): DashboardPreferences | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(PREFS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(fromBase64(raw)) as DashboardPreferences;
  } catch {
    return null;
  }
}
