/**
 * TypeScript declarations for the Rainbow Web SDK v5.
 * The SDK is loaded via dynamic import() from the `rainbow-web-sdk` npm package.
 *
 * Only declares the subset of the API we use for WebRTC call control.
 * @see https://developers.openrainbow.com
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
  _peerConnection?: RTCPeerConnection;
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

export interface RainbowSDKConfig {
  appID: string;
  appSecret: string;
  host: string;
}

/**
 * Rainbow SDK v5 instance — obtained via `RainbowSDK.create(config)`.
 */
export interface RainbowSDKInstance {
  start(): Promise<unknown>;
  stop(): Promise<void>;
  connectionService: {
    signin(login: string, password: string): Promise<unknown>;
    signout(): Promise<void>;
    getState(): string;
  };
  callService: {
    answerInAudio(call: RainbowCall): void;
    reject(call: RainbowCall): void;
    release(call: RainbowCall): void;
    holdCall(call: RainbowCall): void;
    retrieveCall(call: RainbowCall): void;
    muteCall(call: RainbowCall, mute: boolean): void;
  };
  events: {
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
  };
}

/**
 * Rainbow SDK v5 static class — the default export of `rainbow-web-sdk`.
 */
export interface RainbowSDKStatic {
  create(config: RainbowSDKConfig): RainbowSDKInstance;
  getInstance(): RainbowSDKInstance;
}

// Legacy v1/v2 global (kept for reference — v5 uses ES module import)
declare global {
  interface Window {
    rainbowSDK?: RainbowSDKInstance;
  }
}

export {};
