// ─── SSE Event Types ────────────────────────────────────

export interface ScreenPopData {
  interactionId: string;
  callerNumber: string;
  contact: {
    displayName: string;
    email?: string;
    company?: string;
    phone?: string;
    crmUrl?: string;
    avatarUrl?: string;
  } | null;
}

export interface CallUpdatedData {
  interactionId: string;
  status: string;
  rainbowCallId?: string;
}

export interface CallEndedData {
  interactionId: string;
  status: string;
  durationSecs?: number;
}

export interface HeartbeatData {
  timestamp: number;
}

export type SSEEventType = "screen.pop" | "call.updated" | "call.ended" | "heartbeat";

export interface SSEEvent<T = unknown> {
  id: string;
  type: SSEEventType;
  data: T;
  timestamp: number;
}

export interface SSEConnection {
  id: string;
  tenantId: string;
  controller: ReadableStreamDefaultController;
  connectedAt: number;
}
