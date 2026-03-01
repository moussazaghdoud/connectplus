import { z } from "zod";

export const InteractionTypeEnum = z.enum([
  "AUDIO_CALL",
  "VIDEO_CALL",
  "PHONE_CALL",
]);
export type InteractionType = z.infer<typeof InteractionTypeEnum>;

export const InteractionStatusEnum = z.enum([
  "PENDING",
  "INITIATING",
  "RINGING",
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type InteractionStatus = z.infer<typeof InteractionStatusEnum>;

export const DirectionEnum = z.enum(["INBOUND", "OUTBOUND"]);
export type Direction = z.infer<typeof DirectionEnum>;

export const WritebackStatusEnum = z.enum([
  "PENDING",
  "SUCCESS",
  "FAILED",
  "SKIPPED",
]);
export type WritebackStatus = z.infer<typeof WritebackStatusEnum>;

export const StartInteractionSchema = z.object({
  type: InteractionTypeEnum,
  connectorId: z.string().optional(),
  contactId: z.string().optional(),
  externalContactId: z.string().optional(),
  targetPhone: z.string().optional(),
  targetEmail: z.string().email().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type StartInteractionInput = z.infer<typeof StartInteractionSchema>;

export const UpdateInteractionSchema = z.object({
  status: InteractionStatusEnum.optional(),
  failureReason: z.string().optional(),
});

export type UpdateInteractionInput = z.infer<typeof UpdateInteractionSchema>;
