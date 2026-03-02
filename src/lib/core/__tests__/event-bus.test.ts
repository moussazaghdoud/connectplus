import { describe, it, expect, vi, beforeEach } from "vitest";

describe("FrameworkEventBus", () => {
  // Get a fresh event bus each test by clearing the globalThis singleton
  let eventBus: typeof import("../event-bus")["eventBus"];

  beforeEach(async () => {
    // Clear the singleton so we get a fresh instance
    const g = globalThis as unknown as { frameworkEventBus: unknown };
    delete g.frameworkEventBus;
    // Reset module cache so re-import actually re-executes the module
    vi.resetModules();
    const mod = await import("../event-bus");
    eventBus = mod.eventBus;
  });

  it("emits and receives events", () => {
    const handler = vi.fn();
    eventBus.on("interaction.created", handler);
    eventBus.emit("interaction.created", {
      interactionId: "i1",
      tenantId: "t1",
    });
    expect(handler).toHaveBeenCalledWith({
      interactionId: "i1",
      tenantId: "t1",
    });
  });

  it("supports multiple listeners", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    eventBus.on("interaction.completed", h1);
    eventBus.on("interaction.completed", h2);
    eventBus.emit("interaction.completed", {
      interactionId: "i1",
      tenantId: "t1",
    });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("off removes a specific listener", () => {
    const handler = vi.fn();
    eventBus.on("interaction.failed", handler);
    eventBus.off("interaction.failed", handler);
    eventBus.emit("interaction.failed", {
      interactionId: "i1",
      tenantId: "t1",
      error: "test",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("reports correct listener count", () => {
    expect(eventBus.listenerCount("interaction.created")).toBe(0);
    const h = vi.fn();
    eventBus.on("interaction.created", h);
    expect(eventBus.listenerCount("interaction.created")).toBe(1);
    eventBus.off("interaction.created", h);
    expect(eventBus.listenerCount("interaction.created")).toBe(0);
  });

  it("does not cross-fire between event types", () => {
    const created = vi.fn();
    const completed = vi.fn();
    eventBus.on("interaction.created", created);
    eventBus.on("interaction.completed", completed);
    eventBus.emit("interaction.created", {
      interactionId: "i1",
      tenantId: "t1",
    });
    expect(created).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
  });

  it("handles async handlers without breaking", async () => {
    const results: string[] = [];
    eventBus.on("interaction.created", async (payload) => {
      await new Promise((r) => setTimeout(r, 10));
      results.push(payload.interactionId);
    });
    eventBus.emit("interaction.created", {
      interactionId: "i1",
      tenantId: "t1",
    });
    // Wait for async handler
    await new Promise((r) => setTimeout(r, 50));
    expect(results).toEqual(["i1"]);
  });
});
