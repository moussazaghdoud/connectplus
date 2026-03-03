/**
 * Connector Test Runner — runs all test suites against a connector definition.
 */

import type { TestSuiteResult, TestContext, TestResult } from "./types";
import type { ConnectorDefinitionConfig } from "../factory/types";
import { allTests } from "./test-suites";
import { logger } from "../../observability/logger";

export class ConnectorTestRunner {
  /**
   * Run all tests against a connector definition config.
   */
  async run(
    connectorId: string,
    config: ConnectorDefinitionConfig,
    ctx?: Partial<TestContext>
  ): Promise<TestSuiteResult> {
    const start = Date.now();
    const results: TestResult[] = [];

    const testCtx: TestContext = {
      connectorId,
      config: config as unknown as Record<string, unknown>,
      credentials: ctx?.credentials ?? {},
      dryRun: ctx?.dryRun ?? true,
    };

    for (const test of allTests) {
      try {
        const result = await test(config, testCtx);
        results.push(result);
      } catch (err) {
        results.push({
          category: "health_check",
          name: "unknown",
          status: "error",
          durationMs: 0,
          message: err instanceof Error ? err.message : "Unexpected error",
        });
      }
    }

    const passed = results.every((r) => r.status === "passed" || r.status === "skipped");

    const suiteResult: TestSuiteResult = {
      connectorId,
      passed,
      results,
      totalDurationMs: Date.now() - start,
      testedAt: new Date().toISOString(),
    };

    logger.info(
      {
        connectorId,
        passed,
        total: results.length,
        passedCount: results.filter((r) => r.status === "passed").length,
        failedCount: results.filter((r) => r.status === "failed").length,
        skippedCount: results.filter((r) => r.status === "skipped").length,
      },
      "Connector test suite completed"
    );

    return suiteResult;
  }
}

export const connectorTestRunner = new ConnectorTestRunner();
