/**
 * TypeScript declarations for the Rainbow Web SDK v5.
 * Loaded from CDN at runtime via dynamic import.
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

export interface RainbowSDKAppConfig {
  /** Rainbow backend server url */
  server?: string;
  /** Rainbow application identifier */
  applicationId?: string;
  /** Rainbow application secretKey */
  secretKey?: string;
}

export interface RainbowSDKConfig {
  appConfig?: RainbowSDKAppConfig;
  autoLogin?: boolean;
  logLevel?: string;
}

export interface RainbowConnectionService {
  logon(login: string, password: string, rememberMe: boolean): Promise<unknown>;
  logout(): Promise<void>;
  start(): Promise<unknown>;
  stop(): Promise<void>;
}

export interface RainbowCallService {
  answerCall(call: RainbowCall, withVideo?: boolean): Promise<void>;
  releaseCall(call: RainbowCall, reason?: string): Promise<void>;
  holdCall(call: RainbowCall): Promise<void>;
  retrieveCall(call: RainbowCall): Promise<void>;
  muteCall(call: RainbowCall, mute: boolean): void;
  getActiveCall(): RainbowCall | null;
  subscribe(callback: (event: { name: string; data: unknown }) => void, eventNames?: string[]): { unsubscribe: () => void };
}

/**
 * Rainbow SDK v5 instance — obtained via `RainbowSDK.create(config)`.
 */
export interface RainbowSDKInstance {
  start(): Promise<unknown>;
  stop(): Promise<void>;
  connectionService: RainbowConnectionService;
  callService: RainbowCallService;
  getVersion(): string;
}

/**
 * Rainbow SDK v5 static class — the default export of `rainbow-web-sdk`.
 */
export interface RainbowSDKStatic {
  create(config: RainbowSDKConfig): RainbowSDKInstance;
  getInstance(): RainbowSDKInstance;
}

declare global {
  interface Window {
    rainbowSDK?: RainbowSDKInstance;
  }
}

export {};
