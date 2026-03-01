import type { RainbowClient } from "./client";
import type { RainbowContact } from "./types";

/**
 * Rainbow contact operations.
 */
export class RainbowContacts {
  constructor(private client: RainbowClient) {}

  /** Search contacts by display name or email */
  async search(query: string, limit = 20): Promise<RainbowContact[]> {
    const result = await this.client.request<{ data: RainbowContact[] }>(
      `/api/rainbow/enduser/v1.0/users?displayName=${encodeURIComponent(query)}&limit=${limit}&format=full`
    );
    return result.data ?? [];
  }

  /** Get contact by Rainbow user ID */
  async getById(userId: string): Promise<RainbowContact> {
    return this.client.request<RainbowContact>(
      `/api/rainbow/enduser/v1.0/users/${userId}`
    );
  }

  /** Get contact by email */
  async getByEmail(email: string): Promise<RainbowContact | null> {
    const result = await this.client.request<{ data: RainbowContact[] }>(
      `/api/rainbow/enduser/v1.0/users?loginEmail=${encodeURIComponent(email)}&limit=1`
    );
    return result.data?.[0] ?? null;
  }
}
