import { v4 as uuidv4 } from "uuid";
import { prisma } from "../db";
import { eventBus } from "./event-bus";
import { getTenantContext } from "./tenant-context";
import { NotFoundError, ValidationError } from "./errors";
import type { StartInteractionInput, UpdateInteractionInput } from "./models/interaction";
import type { InteractionStatus } from "../../prisma-types";

/**
 * Interaction Manager — orchestrates the lifecycle of communication interactions.
 * All DB writes go through here to ensure events are emitted consistently.
 */
export class InteractionManager {
  /** Create a new interaction */
  async create(input: StartInteractionInput, idempotencyKey?: string) {
    const { tenantId } = getTenantContext();
    const key = idempotencyKey ?? uuidv4();

    // Validate: must have a target
    if (!input.contactId && !input.targetPhone && !input.targetEmail && !input.externalContactId) {
      throw new ValidationError(
        "At least one target is required: contactId, targetPhone, targetEmail, or externalContactId"
      );
    }

    const interaction = await prisma.interaction.create({
      data: {
        tenantId,
        idempotencyKey: key,
        type: input.type,
        status: "PENDING",
        direction: "OUTBOUND",
        connectorId: input.connectorId,
        contactId: input.contactId,
        targetPhone: input.targetPhone,
        targetEmail: input.targetEmail,
        metadata: (input.metadata ?? {}) as Record<string, string>,
      },
    });

    eventBus.emit("interaction.created", {
      interactionId: interaction.id,
      tenantId,
    });

    return interaction;
  }

  /** Get interaction by ID (tenant-scoped) */
  async getById(interactionId: string) {
    const { tenantId } = getTenantContext();

    const interaction = await prisma.interaction.findFirst({
      where: { id: interactionId, tenantId },
      include: { contact: true },
    });

    if (!interaction) {
      throw new NotFoundError("Interaction", interactionId);
    }

    return interaction;
  }

  /** Update interaction status */
  async updateStatus(
    interactionId: string,
    input: UpdateInteractionInput & {
      rainbowCallId?: string;
      rainbowConfId?: string;
      joinUrl?: string;
    }
  ) {
    const { tenantId } = getTenantContext();

    const existing = await prisma.interaction.findFirst({
      where: { id: interactionId, tenantId },
    });

    if (!existing) {
      throw new NotFoundError("Interaction", interactionId);
    }

    const prevStatus = existing.status as InteractionStatus;

    const updateData: Record<string, unknown> = {};
    if (input.status) updateData.status = input.status;
    if (input.failureReason) updateData.failureReason = input.failureReason;
    if (input.rainbowCallId) updateData.rainbowCallId = input.rainbowCallId;
    if (input.rainbowConfId) updateData.rainbowConfId = input.rainbowConfId;
    if (input.joinUrl) updateData.joinUrl = input.joinUrl;

    // Set timestamps based on status
    if (input.status === "ACTIVE" && !existing.startedAt) {
      updateData.startedAt = new Date();
    }
    if (input.status === "COMPLETED" || input.status === "FAILED") {
      updateData.endedAt = new Date();
      if (existing.startedAt) {
        updateData.durationSecs = Math.round(
          (Date.now() - existing.startedAt.getTime()) / 1000
        );
      }
    }

    const updated = await prisma.interaction.update({
      where: { id: interactionId },
      data: updateData,
    });

    if (input.status && input.status !== prevStatus) {
      eventBus.emit("interaction.updated", {
        interactionId,
        tenantId,
        prevStatus,
        newStatus: input.status,
      });

      if (input.status === "COMPLETED") {
        eventBus.emit("interaction.completed", { interactionId, tenantId });
      } else if (input.status === "FAILED") {
        eventBus.emit("interaction.failed", {
          interactionId,
          tenantId,
          error: input.failureReason ?? "Unknown error",
        });
      }
    }

    return updated;
  }

  /** List interactions (tenant-scoped, paginated) */
  async list(opts: { status?: string; connectorId?: string; limit?: number; offset?: number }) {
    const { tenantId } = getTenantContext();

    const where: Record<string, unknown> = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.connectorId) where.connectorId = opts.connectorId;

    const [items, total] = await Promise.all([
      prisma.interaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: opts.limit ?? 50,
        skip: opts.offset ?? 0,
        include: { contact: true },
      }),
      prisma.interaction.count({ where }),
    ]);

    return { items, total };
  }
}

export const interactionManager = new InteractionManager();
