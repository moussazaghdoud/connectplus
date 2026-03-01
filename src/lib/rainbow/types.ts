/** Rainbow authentication response */
export interface RainbowAuthResponse {
  token: string;
  loggedInUser: {
    id: string;
    loginEmail: string;
    firstName: string;
    lastName: string;
    jid_im: string;
    companyId: string;
  };
}

/** Rainbow contact */
export interface RainbowContact {
  id: string;
  loginEmail: string;
  firstName: string;
  lastName: string;
  displayName: string;
  jid_im: string;
  phoneNumbers?: Array<{
    number: string;
    type: string;
    deviceType: string;
  }>;
  companyName?: string;
  title?: string;
}

/** Rainbow call states (from S2S callbacks) */
export type RainbowCallStatus =
  | "dialing"
  | "ringing"
  | "active"
  | "held"
  | "released"
  | "unknown";

/** Rainbow call event (S2S webhook payload) */
export interface RainbowCallEvent {
  callId: string;
  status: RainbowCallStatus;
  callerNumber?: string;
  calleeNumber?: string;
  cause?: string;
}

/** Rainbow conference */
export interface RainbowConference {
  confId: string;
  bubbleId: string;
  joinUrl: string;
  status: string;
}

/** Rainbow API error response */
export interface RainbowErrorResponse {
  errorCode: number;
  errorMsg: string;
  errorDetails?: string;
}
