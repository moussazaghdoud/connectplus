import type { RainbowClient } from "./client";
import type { RainbowConference } from "./types";
import { logger } from "../observability/logger";

/**
 * Rainbow call operations — audio, video (conference), and PSTN.
 */
export class RainbowCalls {
  constructor(private client: RainbowClient) {}

  /**
   * Make a 3PCC audio call to a contact.
   * Requires PBX integration on the Rainbow side.
   */
  async makeCall(contactId: string): Promise<{ callId: string }> {
    logger.info({ contactId }, "Initiating Rainbow audio call");

    const result = await this.client.request<{ callId: string }>(
      "/api/rainbow/telephony/v1.0/calls",
      {
        method: "POST",
        body: JSON.stringify({
          contactId,
          autoAnswer: false,
        }),
      }
    );

    return result;
  }

  /**
   * Make a 3PCC call by phone number (PSTN).
   * Requires PBX integration on the Rainbow side.
   */
  async makeCallByPhoneNumber(
    phoneNumber: string
  ): Promise<{ callId: string }> {
    logger.info({ phoneNumber: phoneNumber.slice(0, -4) + "****" }, "Initiating Rainbow PSTN call");

    const result = await this.client.request<{ callId: string }>(
      "/api/rainbow/telephony/v1.0/calls",
      {
        method: "POST",
        body: JSON.stringify({
          callee: phoneNumber,
          autoAnswer: false,
        }),
      }
    );

    return result;
  }

  /**
   * Create a video conference (bubble-based).
   * Returns a join URL that can be shared.
   */
  async createConference(
    subject: string,
    participants?: string[]
  ): Promise<RainbowConference> {
    logger.info({ subject }, "Creating Rainbow video conference");

    // 1. Create a bubble for the conference
    const bubble = await this.client.request<{
      id: string;
      jid: string;
    }>("/api/rainbow/enduser/v1.0/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: subject,
        topic: `Video call: ${subject}`,
        visibility: "private",
      }),
    });

    // 2. Add participants if provided
    if (participants?.length) {
      for (const userId of participants) {
        await this.client
          .request(
            `/api/rainbow/enduser/v1.0/rooms/${bubble.id}/users/${userId}`,
            { method: "POST", body: JSON.stringify({ reason: "conference" }) }
          )
          .catch((err) =>
            logger.warn({ userId, err }, "Failed to add participant to bubble")
          );
      }
    }

    // 3. Start conference in the bubble
    const conf = await this.client.request<RainbowConference>(
      `/api/rainbow/enduser/v1.0/rooms/${bubble.id}/conferences`,
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    );

    return {
      confId: conf.confId,
      bubbleId: bubble.id,
      joinUrl: conf.joinUrl,
      status: conf.status,
    };
  }

  /** Release (hang up) an active call */
  async releaseCall(callId: string): Promise<void> {
    logger.info({ callId }, "Releasing Rainbow call");

    await this.client.request(
      `/api/rainbow/telephony/v1.0/calls/${callId}`,
      { method: "DELETE" }
    );
  }
}
