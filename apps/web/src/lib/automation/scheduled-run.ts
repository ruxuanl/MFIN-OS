const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function scheduledRunId(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}
