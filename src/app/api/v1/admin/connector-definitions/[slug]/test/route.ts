export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { connectorDefinitionConfigSchema } from "@/lib/connectors/factory";
import { connectorTestRunner } from "@/lib/connectors/testing";
import type { ConnectorDefinitionConfig } from "@/lib/connectors/factory/types";

/**
 * POST /api/v1/admin/connector-definitions/:slug/test — Run the test suite.
 *
 * Validates the config, runs all tests, saves results to the definition.
 */
export const POST = apiHandler(async (_request: NextRequest, ctx, params) => {
  const { slug } = params;

  const definition = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (!definition) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Connector "${slug}" not found` } },
      { status: 404 }
    );
  }

  // Parse config
  const configResult = connectorDefinitionConfigSchema.safeParse(definition.config);
  if (!configResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Config is invalid — fix errors before testing",
          details: configResult.error.issues,
        },
      },
      { status: 400 }
    );
  }

  const config = configResult.data as ConnectorDefinitionConfig;

  // Update status to TESTING
  await prisma.connectorDefinition.update({
    where: { slug },
    data: { status: "TESTING" },
  });

  // Run tests
  const results = await connectorTestRunner.run(slug, config, { dryRun: true });

  // Save results
  await prisma.connectorDefinition.update({
    where: { slug },
    data: {
      lastTestResult: results as unknown as Record<string, unknown>,
      status: results.passed ? definition.status : "DRAFT",
    },
  });

  ctx.log.info({ slug, passed: results.passed }, "Connector tests completed");

  return NextResponse.json(results);
});
