import { logger } from "../observability/logger";

interface FetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Number of retries (default: 2) */
  retries?: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelayMs?: number;
}

/**
 * Fetch wrapper with timeout, retry, and structured logging.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 30000,
    retries = 2,
    retryDelayMs = 1000,
    ...fetchOpts
  } = opts;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...fetchOpts,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Don't retry on 4xx (client errors) — only on 5xx or network errors
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      logger.warn(
        {
          url,
          status: response.status,
          attempt: attempt + 1,
          maxAttempts: retries + 1,
        },
        `HTTP request failed, ${attempt < retries ? "retrying" : "no more retries"}`
      );
    } catch (err) {
      lastError = err as Error;
      logger.warn(
        { url, error: (err as Error).message, attempt: attempt + 1 },
        `HTTP request error, ${attempt < retries ? "retrying" : "no more retries"}`
      );
    }

    // Wait before retry (exponential backoff)
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}
