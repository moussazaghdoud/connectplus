import { v4 as uuidv4 } from "uuid";
import { NextRequest } from "next/server";

const HEADER = "x-correlation-id";

/** Extract or generate a correlation ID from the request */
export function getCorrelationId(request: NextRequest): string {
  return request.headers.get(HEADER) ?? uuidv4();
}

/** Add correlation ID to response headers */
export function setCorrelationIdHeader(
  headers: Headers,
  correlationId: string
): void {
  headers.set(HEADER, correlationId);
}
