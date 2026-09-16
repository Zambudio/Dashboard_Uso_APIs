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
  /** Instrucciones paso a paso para pegar la credencial manualmente cuando el login web es bloqueado (p. ej. por Google). */
  manualHint?: string;
}

export const PROVIDER_DEFINITIONS: Record<ProviderKey, ProviderDefinition> = {
  openai: {
    key: 'openai',
    label: 'OpenAI / ChatGPT',
    kind: 'api',
    secretLabel: 'Admin API Key (sk-admin-...) o Sesión Web',
    secretPlaceholder: 'sk-admin-...',
    helpText:
      'Puedes conectar OpenAI de dos formas (crea una tarjeta por cada una):\n' +
      '• SUSCRIPCIÓN (ChatGPT Plus): pega la cookie/token de sesión — ver pasos abajo.\n' +
      '• API: pega una Admin API Key (sk-admin-...) de platform.openai.com/settings/organization/admin-keys, que sí permite ver costes y uso. Las claves de proyecto (sk-proj-...) no tienen permisos de lectura de costes.',
    helpUrl: 'https://platform.openai.com/settings/organization/admin-keys',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://platform.openai.com/login',
    manualHint:
      'Cómo copiar la credencial de SUSCRIPCIÓN (sin más herramientas que tu navegador):\n' +
      '1) Abre chatgpt.com y asegúrate de haber iniciado sesión en tu navegador.\n' +
      '2) Pulsa F12 → se abre "Herramientas de desarrollo" → pestaña "Aplicación" → menú "Cookies" → elige "https://chatgpt.com".\n' +
      '3) Verás una tabla (Nombre / Valor). Copia el Valor de la fila "__Secure-next-auth.session-token" (o "session-token").\n' +
      '4) Pega ese valor en el campo "Admin API Key o Sesión Web" de la tarjeta de OpenAI y Guardar.\n' +
      'Para la API no hace falta cookie: pega la Admin API Key (sk-admin-...).',
  },
  anthropic: {
    key: 'anthropic',
    label: 'Anthropic Claude (API)',
    kind: 'api',
    secretLabel: 'Admin API Key (sk-ant-admin01-...) o Sesión Web',
    secretPlaceholder: 'sk-ant-admin01-...',
    helpText:
      'La API de métricas de Anthropic requiere una Admin API Key de la organización (console.anthropic.com/settings/admin-keys). Si usas Claude Pro/Code, pulsa "Iniciar sesión web".',
    helpUrl: 'https://console.anthropic.com/settings/admin-keys',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://claude.ai/login',
    manualHint:
      'Pega una Admin API Key (sk-ant-admin01-...) desde console.anthropic.com/settings/admin-keys. Para Claude Pro/Code, usa en su lugar la tarjeta "Claude Pro / Code (suscripción)" con su cookie sessionKey.',
  },
  deepseek: {
    key: 'deepseek',
    label: 'DeepSeek',
    kind: 'api',
    secretLabel: 'API Key o Sesión Web',
    secretPlaceholder: 'sk-... o Sesión Web',
    helpText:
      'Introduce tu API Key (saldo) o pulsa "Iniciar sesión web" para capturar también tu coste acumulado, tokens consumidos y número de peticiones desde la consola de DeepSeek.',
    helpUrl: 'https://platform.deepseek.com/usage',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://platform.deepseek.com/usage',
    manualHint:
      'Pega tu API Key (sk-...) de platform.deepseek.com para el saldo; o, si te interesa el coste y el uso, la cookie de sesión de la consola (DevTools → Aplicación → Cookies → platform.deepseek.com).',
  },
  gemini: {
    key: 'gemini',
    label: 'Google Gemini',
    kind: 'subscription',
    secretLabel: 'API Key o Sesión Web',
    secretPlaceholder: 'AIza... o Sesión Web',
    helpText:
      'Inicia sesión con tu cuenta de Google en Gemini para sincronizar tus límites de uso (Pro/Advanced) o introduce tu API Key de AI Studio.',
    helpUrl: 'https://gemini.google.com',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://gemini.google.com',
    manualHint:
      'Gemini suele conectarse solo a través de Antigravity (Language Server). Si no, usa tu API Key (AIza...) de AI Studio en aistudio.google.com/apikey y pégala en el campo manual.',
  },
  'claude-pro': {
    key: 'claude-pro',
    label: 'Claude Pro / Code (suscripción)',
    kind: 'subscription',
    secretLabel: 'Cookie de sesión (sessionKey)',
    secretPlaceholder: 'sk-ant-sid01-...',
    helpText:
      'Claude por suscripción: usa esta tarjeta con la cookie sessionKey de claude.ai. Para la API de Anthropic (Admin API Key) usa la tarjeta "Anthropic Claude (API)".',
    helpUrl: 'https://claude.ai',
    usageImplemented: true,
    browserLoginSupported: true,
    browserLoginUrl: 'https://claude.ai/login',
    manualHint:
      'Cómo copiar la cookie sessionKey (sin más herramientas que tu navegador):\n' +
      '1) Abre claude.ai e inicia sesión en tu navegador.\n' +
      '2) Pulsa F12 → "Herramientas de desarrollo" → pestaña "Aplicación" → menú "Cookies" → "https://claude.ai".\n' +
      '3) En la tabla (Nombre / Valor) copia el Valor de la fila "sessionKey".\n' +
      '4) Pega ese valor en el campo "Cookie de sesión (sessionKey)" de la tarjeta y Guardar.',
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
