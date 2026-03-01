import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: "connectplus",
    env: process.env.NODE_ENV ?? "development",
  },
});

/** Create a child logger with request context */
export function createRequestLogger(fields: {
  correlationId: string;
  tenantId?: string;
  connectorId?: string;
}) {
  return logger.child(fields);
}
