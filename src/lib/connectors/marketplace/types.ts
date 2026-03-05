/**
 * Connector Marketplace types — shared between API routes and UI.
 */

export type SetupStepType =
  | "select"
  | "instruction"
  | "credentials"
  | "oauth"
  | "test"
  | "activate";

export interface CopyBlock {
  label: string;
  template: string;
}

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "secret" | "url";
  required: boolean;
  placeholder?: string;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface SetupStep {
  id: string;
  title: string;
  description?: string;
  type: SetupStepType;
  field?: string;
  options?: SelectOption[];
  default?: string;
  content?: string;
  copyBlocks?: CopyBlock[];
  fields?: CredentialField[];
  buttonLabel?: string;
  testId?: string;
}

export interface ConnectorMarketplaceEntry {
  slug: string;
  name: string;
  shortDesc: string;
  description: string;
  category: string;
  tier: string;
  authType: string;
  status: string;
  version: number;
  vendorUrl: string | null;
  docsUrl: string | null;
  iconName: string | null;
  pricingTier: string | null;
  prerequisites: string[];
  setupSteps: SetupStep[];
  logoUrl: string | null;
  // Operational
  lastHealthAt: string | null;
  lastHealthStatus: boolean | null;
  lastHealthLatency: number | null;
  lastTokenRefreshAt: string | null;
  lastWebhookAt: string | null;
  lastTestResult: unknown;
  // Tenant-specific
  tenantConfigured: boolean;
  tenantEnabled: boolean;
  tokenStatus: "valid" | "expired" | "missing";
}

export interface DiagnosticResult {
  check: string;
  status: "pass" | "fail" | "skip" | "warn";
  message: string;
  latencyMs?: number;
  detail?: unknown;
}

export interface ConnectorDiagnostics {
  connectorId: string;
  timestamp: string;
  results: DiagnosticResult[];
  overall: "healthy" | "degraded" | "unhealthy" | "unconfigured";
}
