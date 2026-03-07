/**
 * Field Mapper — extracts values from objects using dot-paths and template strings.
 *
 * Supported expressions:
 * - Dot-path: "properties.email" → obj.properties.email
 * - Template: "{{first_name}} {{last_name}}" → "John Doe"
 * - Fallback: "phone || mobile_phone" → tries phone, falls back to mobile_phone
 */

/**
 * Get a value from a nested object using a dot-path.
 * e.g. getByPath({ a: { b: "hello" } }, "a.b") → "hello"
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object" || !path) return undefined;

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Resolve a field expression to a string value.
 *
 * Supports:
 * - "fieldName" → dot-path access
 * - "{{field1}} {{field2}}" → template interpolation
 * - "field1 || field2" → fallback chain
 */
export function resolveField(obj: unknown, expression: string): string {
  if (!expression) return "";

  // Template: contains {{...}} placeholders
  if (expression.includes("{{")) {
    return expression.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const val = getByPath(obj, path.trim());
      return val != null ? String(val) : "";
    }).trim();
  }

  // Fallback chain: "field1 || field2"
  if (expression.includes("||")) {
    const alternatives = expression.split("||").map((s) => s.trim());
    for (const alt of alternatives) {
      const val = getByPath(obj, alt);
      if (val != null && String(val).trim() !== "") {
        return String(val);
      }
    }
    return "";
  }

  // Simple dot-path
  const val = getByPath(obj, expression);
  return val != null ? String(val) : "";
}

/**
 * Apply a template string, replacing {{variable}} placeholders with values from a data object.
 * Used for write-back body templates and URL templates.
 *
 * Supports nested paths: {{interaction.durationSecs}}, {{contact.displayName}}
 */
export function applyTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const val = getByPath(data, path.trim());
    if (val === undefined || val === null) return "";
    // JSON-escape strings to prevent injection
    if (typeof val === "string") return val.replace(/"/g, '\\"');
    return String(val);
  });
}

/**
 * Map an external contact object to canonical fields using a field mapping config.
 */
export function mapContactFields(
  externalContact: unknown,
  mapping: Record<string, string | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [canonicalField, expression] of Object.entries(mapping)) {
    if (!expression || typeof expression !== "string") continue;
    const value = resolveField(externalContact, expression);
    if (value) {
      result[canonicalField] = value;
    }
  }

  return result;
}
