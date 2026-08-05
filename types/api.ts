export type ProviderKey = 'openai' | 'anthropic' | 'deepseek' | 'gemini' | 'claude-pro' | 'custom';
export type ProviderKind = 'api' | 'subscription';
export type ProviderVisibility = 'visible' | 'hidden';
export type ProviderStatus = 'online' | 'warning' | 'offline' | 'error' | 'unconfigured';

/** Snapshot devuelto por /api/usage al consultar el proveedor real. Todos los campos de datos son opcionales: cada proveedor expone unos u otros. */
export interface ApiUsageSnapshot {
  fetchedAt: string;
  balance?: number;
  currency?: string;
  accumulatedCost?: number;
  tokensUsed?: number;
  requestCount?: number;
  /** Solo proveedores tipo 'subscription' (ej. Claude Pro): % de uso 0-100 */
  sessionUtilization?: number;
  weeklyUtilization?: number;
  sessionResetsAt?: string;
  weeklyResetsAt?: string;
  /** Campos que la API pública de este proveedor no expone (se avisa en UI en vez de inventarlos) */
  unavailable?: string[];
  error?: string;
}

export interface ApiProviderConfig {
  id: string;
  name: string;
  provider: ProviderKey;
  kind: ProviderKind;
  /** 'api': API key del proveedor. 'subscription': cookie de sesión. Nunca datos falsos. */
  apiKey: string;
  status: ProviderStatus;
  visibility?: ProviderVisibility;
  usage?: ApiUsageSnapshot;
}

export interface DashboardPreferences {
  showHiddenProviders: boolean;
  showSummaryCards: boolean;
  sortOrder: 'default' | 'status' | 'balance' | 'cost';
}
