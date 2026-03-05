/**
 * CTI Bridge — initialization and wiring.
 *
 * Connects the event processor to the Zoho CRM lookup and call logging functions.
 * Called from instrumentation.ts on server startup.
 */

export { processEvent } from "./bridge/event-processor";
export { setCrmLookup, setCallLogger } from "./bridge/event-processor";
export { addSubscriber, removeSubscriber, broadcastCallEvent, getSubscriberCount } from "./bridge/websocket-manager";
export { getCorrelationId, isDuplicateEvent, clearCorrelation } from "./correlation/correlator";
export { updateCallState, getCall, getAgentCalls, getTenantCalls } from "./state/call-state-store";
export type { CtiCallEvent, CallState, CallDirection, CrmContext } from "./types/call-event";
export type { CtiConnector, CtiEventHandler } from "./types/cti-connector";
