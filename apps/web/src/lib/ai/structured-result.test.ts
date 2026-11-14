import { describe, expect, it } from "vitest";
import { parseStructuredResult } from "./structured-result";

const schema = { type: "object", additionalProperties: false, required: ["score", "scope"], properties: {
  score: { type: "integer", minimum: 0, maximum: 100 }, scope: { type: "string", enum: ["content_only"] }
} };
describe("untrusted AI output validation", () => {
  it("accepts a complete result", () => {
    expect(parseStructuredResult('{"score":80,"scope":"content_only"}', schema).score).toBe(80);
  });
  it.each(['{}', '{"score":101,"scope":"content_only"}', '{"score":2.5,"scope":"content_only"}',
    '{"score":80,"scope":"visual"}', '{"score":80,"scope":"content_only","extra":true}',
    '{"score":80,"scope":"content_only"} trailing text'])
  ("rejects missing fields, invalid scores, extra fields and non-JSON suffixes: %s", (text) => {
    expect(() => parseStructuredResult(text, schema)).toThrow();
  });
});
