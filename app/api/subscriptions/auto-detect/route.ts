import { NextResponse } from 'next/server';
import {
  detectAvailableLocalSubscriptions,
  getLocalClaudeCredentials,
  getLocalCodexCredentials,
  getAntigravityLanguageServerCredentials,
} from '@/lib/local-subscriptions.server';
import { readDashboardState, writeDashboardState, readEnvKeys, writeEnvKeys } from '@/lib/env-keys.server';
import { fetchClaudeOAuthUsage } from '@/lib/usage/claude-oauth.server';
import { fetchOpenAIUsage } from '@/lib/usage/openai.server';
import { fetchAntigravityUsage } from '@/lib/usage/antigravity.server';
import { saveSyncedSnapshot } from '@/lib/synced-cache.server';
import { ApiProviderConfig } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await detectAvailableLocalSubscriptions();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error detectando suscripciones' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const status = await detectAvailableLocalSubscriptions();
    const state = await readDashboardState<{ providers?: ApiProviderConfig[] }>();
    const currentProviders = state.providers || [];
    const keys = await readEnvKeys();
    const updatedKeys = { ...keys };
    const syncResults: Record<string, { success: boolean; planType?: string; error?: string }> = {};

    // 1. Claude Code / Claude OAuth
    if (status.claude.available) {
      const claudeCreds = getLocalClaudeCredentials();
      if (claudeCreds?.token) {
        let providerEntry = currentProviders.find((p) => p.provider === 'claude-pro' || p.id === 'anthropic' || p.provider === 'anthropic');
        if (!providerEntry) {
          providerEntry = {
            id: 'claude-pro',
            name: 'Anthropic Claude',
            provider: 'claude-pro',
            kind: 'subscription',
            apiKey: '',
            connected: true,
            status: 'online',
            visibility: 'visible',
          };
          currentProviders.push(providerEntry);
        }

        updatedKeys[providerEntry.id] = claudeCreds.token;

        try {
          const snap = await fetchClaudeOAuthUsage(claudeCreds.token);
          saveSyncedSnapshot(providerEntry.id, providerEntry.provider, snap);
          providerEntry.usage = snap;
          providerEntry.connected = true;
          providerEntry.status = 'online';
          syncResults.claude = { success: true, planType: snap.planType };
        } catch (e) {
          syncResults.claude = { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    }

    // 2. OpenAI / ChatGPT Plus
    if (status.openai.available) {
      const codexCreds = getLocalCodexCredentials();
      if (codexCreds?.accessToken) {
        let providerEntry = currentProviders.find((p) => p.provider === 'openai');
        if (!providerEntry) {
          providerEntry = {
            id: 'openai',
            name: 'OpenAI / ChatGPT',
            provider: 'openai',
            kind: 'subscription',
            apiKey: '',
            connected: true,
            status: 'online',
            visibility: 'visible',
          };
          currentProviders.push(providerEntry);
        }

        updatedKeys[providerEntry.id] = JSON.stringify({
          accessToken: codexCreds.accessToken,
          organizationId: codexCreds.accountId,
        });

        try {
          const snap = await fetchOpenAIUsage(codexCreds.accessToken);
          saveSyncedSnapshot(providerEntry.id, providerEntry.provider, snap);
          providerEntry.usage = snap;
          providerEntry.connected = true;
          providerEntry.status = 'online';
          syncResults.openai = { success: true, planType: snap.planType };
        } catch (e) {
          syncResults.openai = { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    }

    // 3. Google Gemini / Antigravity
    if (status.gemini.available) {
      const agCreds = getAntigravityLanguageServerCredentials();
      if (agCreds?.port) {
        let providerEntry = currentProviders.find((p) => p.provider === 'gemini');
        if (!providerEntry) {
          providerEntry = {
            id: 'gemini',
            name: 'Google Gemini',
            provider: 'gemini',
            kind: 'subscription',
            apiKey: '',
            connected: true,
            status: 'online',
            visibility: 'visible',
          };
          currentProviders.push(providerEntry);
        }

        try {
          const snap = await fetchAntigravityUsage('gemini');
          if (snap) {
            saveSyncedSnapshot(providerEntry.id, providerEntry.provider, snap);
            providerEntry.usage = snap;
            providerEntry.connected = true;
            providerEntry.status = 'online';
            syncResults.gemini = { success: true, planType: snap.planType };
          }
        } catch (e) {
          syncResults.gemini = { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    }

    // Persistir estado y credenciales
    await writeEnvKeys(updatedKeys);
    await writeDashboardState({ providers: currentProviders });

    return NextResponse.json({
      status,
      syncResults,
      providers: currentProviders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al sincronizar suscripciones locales' },
      { status: 500 }
    );
  }
}
