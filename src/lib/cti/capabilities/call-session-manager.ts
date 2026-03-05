/**
 * Call Session Manager — shared lifecycle management for all telephony connectors.
 *
 * Provides:
 * - Call session creation and tracking
 * - State machine enforcement (ringing -> connected -> held -> ended)
 * - Duration tracking
 * - Session metadata (CRM context, agent info)
 *
 * Reusable by: Zoho CTI, Salesforce CTI, HubSpot CTI, RingCentral, etc.
 */

import type { CallState, CrmContext } from "../types/call-event";

export interface CallSession {
  sessionId: string;
  callId: string;
  correlationId: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  agentId: string;
  tenantId: string;
  state: CallState;
  crmContext?: CrmContext;
  startedAt: number;
  answeredAt?: number;
  endedAt?: number;
  isMuted: boolean;
  isOnHold: boolean;
}

/** Valid state transitions for call lifecycle */
const VALID_TRANSITIONS: Record<CallState, CallState[]> = {
  ringing: ["connected", "missed", "failed", "ended"],
  connected: ["held", "ended", "failed"],
  held: ["connected", "ended", "failed"],
  ended: [],
  missed: [],
  failed: [],
};

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: CallState, to: CallState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Calculate call duration in seconds.
 */
export function calculateDuration(session: CallSession): number {
  if (!session.answeredAt) return 0;
  const end = session.endedAt ?? Date.now();
  return Math.round((end - session.answeredAt) / 1000);
}

/**
 * Determine if a call state is terminal (no more transitions possible).
 */
export function isTerminalState(state: CallState): boolean {
  return state === "ended" || state === "missed" || state === "failed";
}

/**
 * Create a new call session from an incoming event.
 */
export function createSession(params: {
  callId: string;
  correlationId: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  agentId: string;
  tenantId: string;
  crmContext?: CrmContext;
}): CallSession {
  return {
    sessionId: `${params.tenantId}:${params.callId}`,
    callId: params.callId,
    correlationId: params.correlationId,
    direction: params.direction,
    fromNumber: params.fromNumber,
    toNumber: params.toNumber,
    agentId: params.agentId,
    tenantId: params.tenantId,
    state: "ringing",
    crmContext: params.crmContext,
    startedAt: Date.now(),
    isMuted: false,
    isOnHold: false,
  };
}

/**
 * Apply a state transition to a session. Returns updated session or null if invalid.
 */
export function transitionSession(
  session: CallSession,
  newState: CallState
): CallSession | null {
  if (!isValidTransition(session.state, newState)) {
    return null;
  }

  const updated = { ...session, state: newState };

  if (newState === "connected" && !session.answeredAt) {
    updated.answeredAt = Date.now();
  }
  if (newState === "held") {
    updated.isOnHold = true;
  }
  if (session.state === "held" && newState === "connected") {
    updated.isOnHold = false;
  }
  if (isTerminalState(newState)) {
    updated.endedAt = Date.now();
  }

  return updated;
}
