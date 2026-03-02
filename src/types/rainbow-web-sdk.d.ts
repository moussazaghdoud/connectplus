/**
 * TypeScript declarations for the Rainbow Web SDK loaded via CDN <script> tag.
 * Only declares the subset of the API we use for WebRTC call control.
 *
 * @see https://hub.openrainbow.com/doc/sdk/web/guides
 */

export interface RainbowCall {
  id: string;
  status: RainbowCallStatus;
  remoteMedia?: MediaStream;
  localMedia?: MediaStream;
  contact?: {
    id: string;
    displayName?: string;
    phoneNumbers?: Array<{ number: string; type: string }>;
  };
  callerNumber?: string;
  calleeNumber?: string;
  isIncoming: boolean;
  isOnHold: boolean;
  isMuted: boolean;
}

export type RainbowCallStatus =
  | "Unknown"
  | "ringing-incoming"
  | "ringing-outgoing"
  | "connecting"
  | "active"
  | "on-hold"
  | "releasing"
  | "unknown";

export interface RainbowConnectionConfig {
  appID: string;
  appSecret: string;
  host: string;
}

export interface RainbowSDK {
  connection: {
    initialize(config: RainbowConnectionConfig): Promise<void>;
    signin(login: string, password: string): Promise<void>;
    signout(): Promise<void>;
    getState(): string;
  };
  webRTC: {
    answerInAudio(call: RainbowCall): void;
    reject(call: RainbowCall): void;
    release(call: RainbowCall): void;
    holdCall(call: RainbowCall): void;
    retrieveCall(call: RainbowCall): void;
    muteCall(call: RainbowCall, mute: boolean): void;
    onWebRTCCallChanged(callback: (call: RainbowCall) => void): void;
  };
  events: {
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
  };
}

declare global {
  interface Window {
    rainbowSDK?: RainbowSDK;
  }
}

export {};
