/**
 * CTI Connector interface — the contract all telephony/CTI connectors must implement.
 * Modeled after enterprise CTI vendors (RingCentral, 3CX, Genesys).
 */

import type { CtiCallEvent, CallState } from "./call-event";

export interface StartCallParams {
  toNumber: string;
  context?: {
    zohoRecordId?: string;
    zohoUserId?: string;
    module?: string;
  };
}

export interface CallControlResult {
  success: boolean;
  callId?: string;
  error?: string;
}

export interface CallStateInfo {
  callId: string;
  correlationId: string;
  state: CallState;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound";
  startedAt: string;
  durationSecs?: number;
}

export type CtiEventHandler = (event: CtiCallEvent) => void | Promise<void>;

export interface CtiConnector {
  readonly slug: string;
  readonly name: string;

  /** Initiate an outbound call (click-to-call) */
  startCall(params: StartCallParams): Promise<CallControlResult>;

  /** Answer an incoming call */
  answer(callId: string): Promise<CallControlResult>;

  /** Hang up a call */
  hangup(callId: string): Promise<CallControlResult>;

  /** Toggle hold on/off */
  hold(callId: string, on: boolean): Promise<CallControlResult>;

  /** Toggle mute on/off */
  mute(callId: string, on: boolean): Promise<CallControlResult>;

  /** Transfer call to another number or agent */
  transfer(callId: string, target: string): Promise<CallControlResult>;

  /** Send DTMF digits during a call */
  sendDtmf(callId: string, digits: string): Promise<CallControlResult>;

  /** Get current call state */
  getCallState(callId: string): Promise<CallStateInfo | null>;

  /** Subscribe to real-time call events */
  subscribeCallEvents(handler: CtiEventHandler): () => void;

  /** Health check */
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}
