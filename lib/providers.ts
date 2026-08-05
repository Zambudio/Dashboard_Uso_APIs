import { ProviderKey, ProviderKind } from '@/types/api';

export interface ProviderDefinition {
  key: ProviderKey;
  label: string;
  kind: ProviderKind;
  secretLabel: string;
  secretPlaceholder: string;
  helpText: string;
  helpUrl?: string;
  /** Si false, /api/usage no intenta consultar datos reales todavía para este proveedor. */
  usageImplemented: boolean;
}

export const PROVIDER_DEFINITIONS: Record<ProviderKey, ProviderDefinition> = {
  openai: {
    key: 'openai',
    label: 'OpenAI (API)',
    kind: 'api',
    secretLabel: 'Admin API Key',
    secretPlaceholder: 'sk-admin-...',
    helpText: 'La consulta de uso necesita una Admin API key de la organización (no la key normal de proyecto). Se crea en Organization Settings.',
    helpUrl: 'https://platform.openai.com/settings/organization/admin-keys',
    usageImplemented: true,
  },
  anthropic: {
    key: 'anthropic',
    label: 'Anthropic Claude (API)',
    kind: 'api',
    secretLabel: 'Admin API Key',
    secretPlaceholder: 'sk-ant-admin01-...',
    helpText: 'La consulta de uso necesita una Admin API key (Claude Console > Settings > Admin keys), no la key normal de la API.',
    helpUrl: 'https://console.anthropic.com/settings/admin-keys',
    usageImplemented: true,
  },
  deepseek: {
    key: 'deepseek',
    label: 'DeepSeek',
    kind: 'api',
    secretLabel: 'API Key',
    secretPlaceholder: 'sk-...',
    helpText: 'La API pública de DeepSeek solo expone el saldo disponible. Coste, tokens y nº de peticiones no están disponibles vía API (solo en su web).',
    helpUrl: 'https://platform.deepseek.com/api_keys',
    usageImplemented: true,
  },
  gemini: {
    key: 'gemini',
    label: 'Google Gemini',
    kind: 'api',
    secretLabel: 'API Key',
    secretPlaceholder: 'AIza...',
    helpText: 'Consulta automática de uso todavía no implementada para Gemini.',
    usageImplemented: false,
  },
  'claude-pro': {
    key: 'claude-pro',
    label: 'Claude Pro (suscripción)',
    kind: 'subscription',
    secretLabel: 'Cookie de sesión (sessionKey)',
    secretPlaceholder: 'sk-ant-sid01-...',
    helpText:
      'No es una API key: inicia sesión en claude.ai, abre las DevTools del navegador (F12) → Application/Almacenamiento → Cookies → claude.ai, copia el valor de la cookie "sessionKey". ' +
      'Esta cookie da acceso completo a tu cuenta; guárdala solo si confías en este equipo. Se usa un Chromium en segundo plano (no hay API pública de suscripción) para leer los endpoints internos de claude.ai — pueden cambiar sin aviso. ' +
      'La primera vez que pulses "Actualizar" se descargará Chromium (~300MB, necesita internet); puede tardar varios minutos.',
    helpUrl: 'https://claude.ai',
    usageImplemented: true,
  },
  custom: {
    key: 'custom',
    label: 'Personalizado',
    kind: 'api',
    secretLabel: 'API Key',
    secretPlaceholder: '',
    helpText: 'Proveedor personalizado: guarda la key, pero la consulta automática de uso no está implementada.',
    usageImplemented: false,
  },
};

export function getProviderDefinition(provider: ProviderKey): ProviderDefinition {
  return PROVIDER_DEFINITIONS[provider] ?? PROVIDER_DEFINITIONS.custom;
}
