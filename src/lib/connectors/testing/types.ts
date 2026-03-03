export type TestCategory = "auth" | "contact_search" | "write_back" | "webhook" | "health_check";

export type TestStatus = "passed" | "failed" | "skipped" | "error";

export interface TestResult {
  category: TestCategory;
  name: string;
  status: TestStatus;
  durationMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface TestSuiteResult {
  connectorId: string;
  passed: boolean;
  results: TestResult[];
  totalDurationMs: number;
  testedAt: string;
}

export interface TestContext {
  connectorId: string;
  config: Record<string, unknown>;
  credentials: Record<string, string>;
  dryRun: boolean;
}
