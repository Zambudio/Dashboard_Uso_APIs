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
  /** Si true, permite iniciar sesión abriendo una ventana de navegador interactiva */
  browserLoginSupported?: boolean;
  browserLoginUrl?: string;
}

export const PROVIDER_DEFINITIONS: Record<ProviderKey, ProviderDefinition> = {
  openai: {
    key: 'openai',
    label: 'OpenAI / ChatGPT',
    kind: 'api',
    secretLabel: 'Admin API Key (sk-admin-...) o Sesión Web',
    secretPlaceholder: 'sk-admin-...',
    helpText: 'Para ver el consumo de tokens y costes necesitas una Admin API Key de la organización (platform.openai.com/settings/organization/admin-keys) o pulsar "Iniciar sesión web". Las claves de proyecto (sk-proj-...) no tienen permisos de lectura de costes.',
    helpUrl: 'https://platform.openai.com/settings/organization/admin-keys',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://platform.openai.com/login',
  },
  anthropic: {
    key: 'anthropic',
    label: 'Anthropic Claude (API)',
    kind: 'api',
    secretLabel: 'Admin API Key (sk-ant-admin01-...) o Sesión Web',
    secretPlaceholder: 'sk-ant-admin01-...',
    helpText: 'La API de métricas de Anthropic requiere una Admin API Key de la organización (console.anthropic.com/settings/admin-keys). Si usas Claude Pro/Code, pulsa "Iniciar sesión web".',
    helpUrl: 'https://console.anthropic.com/settings/admin-keys',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://claude.ai/login',
  },
  deepseek: {
    key: 'deepseek',
    label: 'DeepSeek',
    kind: 'api',
    secretLabel: 'API Key o Sesión Web',
    secretPlaceholder: 'sk-... o Sesión Web',
    helpText: 'Introduce tu API Key (saldo) o pulsa "Iniciar sesión web" para capturar también tu coste acumulado, tokens consumidos y número de peticiones desde la consola de DeepSeek.',
    helpUrl: 'https://platform.deepseek.com/usage',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://platform.deepseek.com/usage',
  },
  gemini: {
    key: 'gemini',
    label: 'Google Gemini',
    kind: 'subscription',
    secretLabel: 'API Key o Sesión Web',
    secretPlaceholder: 'AIza... o Sesión Web',
    helpText: 'Inicia sesión con tu cuenta de Google en Gemini para sincronizar tus límites de uso (Pro/Advanced) o introduce tu API Key de AI Studio.',
    helpUrl: 'https://gemini.google.com',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://gemini.google.com',
  },
  'claude-pro': {
    key: 'claude-pro',
    label: 'Claude Pro / Code (suscripción)',
    kind: 'subscription',
    secretLabel: 'Cookie de sesión (sessionKey)',
    secretPlaceholder: 'sk-ant-sid01-...',
    helpText:
      'Inicia sesión directamente con tu cuenta en claude.ai con el botón de "Iniciar sesión con navegador", o pega manualmente la cookie sessionKey.',
    helpUrl: 'https://claude.ai',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://claude.ai/login',
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

