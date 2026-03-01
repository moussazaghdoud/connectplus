import { AsyncLocalStorage } from "async_hooks";
import type { TenantContext } from "./models/tenant";

/**
 * AsyncLocalStorage-based tenant context.
 * Every request runs inside a tenant scope — all downstream code
 * can call getTenantContext() without passing tenantId explicitly.
 */
const tenantStorage = new AsyncLocalStorage<TenantContext>();

/** Run a function within a tenant context */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStorage.run(ctx, fn);
}

/** Get the current tenant context (throws if not in a tenant scope) */
export function getTenantContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error(
      "No tenant context available. Ensure request passes through auth middleware."
    );
  }
  return ctx;
}

/** Get the current tenant context or null */
export function tryGetTenantContext(): TenantContext | null {
  return tenantStorage.getStore() ?? null;
}
