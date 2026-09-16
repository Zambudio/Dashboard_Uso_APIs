import fs from 'fs';
import path from 'path';
import { ApiUsageSnapshot, ProviderKey } from '@/types/api';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const CACHE_FILE = path.join(DATA_DIR, 'usage-cache.json');

export interface CachedProviderSnapshot {
  providerId: string;
  provider: ProviderKey;
  snapshot: ApiUsageSnapshot;
  updatedAt: string;
}

export type UsageCacheMap = Record<string, CachedProviderSnapshot>;

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[synced-cache] Could not create .data directory:', err);
  }
}

export function readSyncedCache(): UsageCacheMap {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(raw) as UsageCacheMap;
  } catch (err) {
    console.warn('[synced-cache] Error reading cache file:', err);
    return {};
  }
}

export function writeSyncedCache(cache: UsageCacheMap): void {
  try {
    ensureDataDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('[synced-cache] Error writing cache file:', err);
  }
}

export function saveSyncedSnapshot(
  providerId: string,
  provider: ProviderKey,
  snapshot: ApiUsageSnapshot
): CachedProviderSnapshot {
  const cache = readSyncedCache();
  const entry: CachedProviderSnapshot = {
    providerId,
    provider,
    snapshot: {
      ...snapshot,
      fetchedAt: snapshot.fetchedAt || new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  cache[providerId] = entry;
  if (providerId === 'claude-pro' || provider === 'claude-pro') {
    cache['anthropic'] = { ...entry, providerId: 'anthropic' };
  } else if (providerId === 'anthropic' || provider === 'anthropic') {
    cache['claude-pro'] = { ...entry, providerId: 'claude-pro' };
  }
  writeSyncedCache(cache);
  return entry;
}

export function getSyncedSnapshot(providerId: string): CachedProviderSnapshot | null {
  const cache = readSyncedCache();
  if (cache[providerId]) return cache[providerId];
  if (providerId === 'anthropic' && cache['claude-pro']) return cache['claude-pro'];
  if (providerId === 'claude-pro' && cache['anthropic']) return cache['anthropic'];
  return null;
}
