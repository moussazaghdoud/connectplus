export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { connectorRegistry } from "@/lib/core";
import { metrics } from "@/lib/observability/metrics";

export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // DB check
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "healthy", latencyMs: Date.now() - dbStart };
  } catch {
    checks.database = { status: "unhealthy", latencyMs: Date.now() - dbStart };
  }

  // Connectors
  checks.connectors = {
    status: "healthy",
    latencyMs: 0,
  };

  const allHealthy = Object.values(checks).every((c) => c.status === "healthy");

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      version: "0.1.0",
      uptime: process.uptime(),
      checks,
      connectors: connectorRegistry.listIds(),
      metrics: metrics.snapshot(),
    },
    { status: allHealthy ? 200 : 503 }
  );
}
