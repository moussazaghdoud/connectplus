/**
 * Sample data generators for connector testing.
 */

export function sampleInteraction() {
  return {
    id: "test-interaction-001",
    tenantId: "test-tenant",
    contactId: "test-contact-001",
    idempotencyKey: "test-idem-001",
    type: "PHONE_CALL",
    status: "COMPLETED",
    direction: "INBOUND",
    rainbowCallId: "test-rainbow-call-001",
    connectorId: "test-connector",
    externalId: "ext-contact-123",
    targetPhone: "+33612345678",
    startedAt: new Date("2026-01-01T10:00:00Z"),
    endedAt: new Date("2026-01-01T10:05:00Z"),
    durationSecs: 300,
    writebackStatus: "PENDING",
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    rainbowConfId: null,
    joinUrl: null,
    targetEmail: null,
    failureReason: null,
  };
}

export function sampleWebhookPayload(eventType = "contact.created", externalId = "ext-123") {
  return {
    event_type: eventType,
    data: {
      id: externalId,
      name: "Test Contact",
      email: "test@example.com",
    },
    timestamp: Math.floor(Date.now() / 1000),
    event_id: `evt-${Date.now()}`,
  };
}

export function sampleContact() {
  return {
    id: "ext-123",
    properties: {
      firstname: "Test",
      lastname: "User",
      email: "test@example.com",
      phone: "+33612345678",
      company: "Test Corp",
      jobtitle: "Tester",
    },
  };
}
