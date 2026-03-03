import { describe, it, expect } from "vitest";
import { getByPath, resolveField, applyTemplate, mapContactFields } from "../field-mapper";

describe("getByPath", () => {
  const obj = {
    name: "John",
    properties: { email: "john@example.com", phone: "+1234" },
    nested: { deep: { value: 42 } },
  };

  it("gets top-level fields", () => {
    expect(getByPath(obj, "name")).toBe("John");
  });

  it("gets nested fields", () => {
    expect(getByPath(obj, "properties.email")).toBe("john@example.com");
    expect(getByPath(obj, "nested.deep.value")).toBe(42);
  });

  it("returns undefined for missing paths", () => {
    expect(getByPath(obj, "missing")).toBeUndefined();
    expect(getByPath(obj, "properties.missing")).toBeUndefined();
    expect(getByPath(obj, "a.b.c.d")).toBeUndefined();
  });

  it("handles null/undefined input", () => {
    expect(getByPath(null, "x")).toBeUndefined();
    expect(getByPath(undefined, "x")).toBeUndefined();
  });

  it("handles empty path", () => {
    expect(getByPath(obj, "")).toBeUndefined();
  });
});

describe("resolveField", () => {
  const contact = {
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@example.com",
    phone: "",
    mobile_phone: "+5678",
    properties: { company: "Acme" },
  };

  it("resolves simple dot-path", () => {
    expect(resolveField(contact, "email")).toBe("jane@example.com");
    expect(resolveField(contact, "properties.company")).toBe("Acme");
  });

  it("resolves template expressions", () => {
    expect(resolveField(contact, "{{first_name}} {{last_name}}")).toBe("Jane Doe");
  });

  it("resolves fallback chains", () => {
    expect(resolveField(contact, "phone || mobile_phone")).toBe("+5678");
    expect(resolveField(contact, "email || mobile_phone")).toBe("jane@example.com");
  });

  it("returns empty string for missing fields", () => {
    expect(resolveField(contact, "missing")).toBe("");
    expect(resolveField(contact, "")).toBe("");
  });

  it("handles template with missing fields", () => {
    expect(resolveField(contact, "{{first_name}} {{middle_name}}")).toBe("Jane");
  });
});

describe("applyTemplate", () => {
  it("replaces placeholders with values", () => {
    const data = { interaction: { type: "PHONE_CALL", status: "COMPLETED", durationSecs: 120 } };
    const template = '{"type":"{{interaction.type}}","duration":{{interaction.durationSecs}}}';
    expect(applyTemplate(template, data)).toBe('{"type":"PHONE_CALL","duration":120}');
  });

  it("handles missing values as empty strings", () => {
    expect(applyTemplate("{{missing}}", {})).toBe("");
  });

  it("escapes quotes in string values", () => {
    const data = { name: 'John "Johnny" Doe' };
    expect(applyTemplate("{{name}}", data)).toBe('John \\"Johnny\\" Doe');
  });
});

describe("mapContactFields", () => {
  const hubspotContact = {
    properties: {
      firstname: "Alice",
      lastname: "Smith",
      email: "alice@acme.com",
      phone: "+1111",
      company: "Acme Corp",
      jobtitle: "CTO",
    },
  };

  it("maps fields using dot-paths", () => {
    const result = mapContactFields(hubspotContact, {
      displayName: "{{properties.firstname}} {{properties.lastname}}",
      email: "properties.email",
      phone: "properties.phone",
      company: "properties.company",
      title: "properties.jobtitle",
    });

    expect(result.displayName).toBe("Alice Smith");
    expect(result.email).toBe("alice@acme.com");
    expect(result.phone).toBe("+1111");
    expect(result.company).toBe("Acme Corp");
    expect(result.title).toBe("CTO");
  });

  it("skips undefined mappings", () => {
    const result = mapContactFields(hubspotContact, {
      displayName: "properties.firstname",
      email: undefined,
    });
    expect(result.displayName).toBe("Alice");
    expect(result.email).toBeUndefined();
  });

  it("skips empty results", () => {
    const result = mapContactFields(hubspotContact, {
      displayName: "properties.firstname",
      avatarUrl: "properties.avatar",
    });
    expect(result.displayName).toBe("Alice");
    expect(result.avatarUrl).toBeUndefined();
  });
});
