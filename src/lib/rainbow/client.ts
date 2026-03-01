import { fetchWithRetry } from "../utils/http";
import { RainbowApiError } from "../core/errors";
import { logger } from "../observability/logger";
import { metrics } from "../observability/metrics";
import type { RainbowAuthResponse } from "./types";

const SANDBOX_HOST = "https://sandbox.openrainbow.com";
const PROD_HOST = "https://openrainbow.com";

interface RainbowClientConfig {
  host: "sandbox" | "official";
  login: string;
  password: string;
  appId: string;
  appSecret: string;
}

/**
 * Thin REST wrapper around Rainbow CPaaS APIs.
 * Handles authentication, token refresh, and base HTTP calls.
 */
export class RainbowClient {
  private config: RainbowClientConfig;
  private baseUrl: string;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: RainbowClientConfig) {
    this.config = config;
    this.baseUrl =
      config.host === "official" ? PROD_HOST : SANDBOX_HOST;
  }

  /** Authenticate and get JWT token */
  async login(): Promise<RainbowAuthResponse> {
    const credentials = Buffer.from(
      `${this.config.login}:${this.config.password}`
    ).toString("base64");

    const appAuth = Buffer.from(
      `${this.config.appId}:${this.config.appSecret}`
    ).toString("base64");

    const response = await this.rawFetch(
      "/api/rainbow/authentication/v1.0/login",
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${credentials}`,
          "x-rainbow-app-auth": `Basic ${appAuth}`,
          Accept: "application/json",
        },
      }
    );

    const data = (await response.json()) as RainbowAuthResponse;
    this.token = data.token;
    // Token typically valid for 24h, refresh at 23h
    this.tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;

    logger.info("Rainbow authentication successful");
    return data;
  }

  /** Ensure we have a valid token */
  async ensureAuthenticated(): Promise<string> {
    if (!this.token || Date.now() >= this.tokenExpiresAt) {
      await this.login();
    }
    return this.token!;
  }

  /** Make an authenticated API call to Rainbow */
  async request<T = unknown>(
    path: string,
    opts: RequestInit = {}
  ): Promise<T> {
    const token = await this.ensureAuthenticated();
    const startTime = Date.now();

    const response = await this.rawFetch(path, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(opts.headers ?? {}),
      },
    });

    const duration = Date.now() - startTime;
    metrics.increment("rainbow_api_calls", {
      endpoint: path.split("?")[0],
      status: String(response.status),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        { path, status: response.status, body: errorBody, durationMs: duration },
        `Rainbow API error: ${response.status}`
      );
      throw new RainbowApiError(
        `Rainbow API ${path} returned ${response.status}: ${errorBody}`,
        response.status >= 500 ? 502 : response.status
      );
    }

    return (await response.json()) as T;
  }

  /** Low-level fetch with retry and timeout */
  private rawFetch(path: string, opts: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    return fetchWithRetry(url, {
      ...opts,
      retries: 1,
      timeoutMs: 15000,
    });
  }

  get authenticated(): boolean {
    return !!this.token && Date.now() < this.tokenExpiresAt;
  }
}
