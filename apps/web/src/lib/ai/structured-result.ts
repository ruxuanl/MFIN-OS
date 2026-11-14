type Schema = {
  type?: string; enum?: unknown[]; properties?: Record<string, Schema>; required?: string[];
  additionalProperties?: boolean; items?: Schema; minimum?: number; maximum?: number;
};

function matches(value: unknown, schema: Schema): boolean {
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    if (schema.required?.some((key) => !Object.hasOwn(object, key))) return false;
    return Object.entries(object).every(([key, item]) => Object.hasOwn(properties, key)
      ? matches(item, properties[key]) : schema.additionalProperties !== false);
  }
  if (schema.type === "array") return Array.isArray(value) && value.every((item) => schema.items && matches(item, schema.items));
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "integer") return typeof value === "number" && Number.isSafeInteger(value)
    && (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum);
  return false;
}

export function parseStructuredResult(text: string, schema: Record<string, unknown>) {
  const value: unknown = JSON.parse(text);
  if (!matches(value, schema as Schema)) throw new Error("ai_invalid_result");
  return value as Record<string, unknown>;
}
