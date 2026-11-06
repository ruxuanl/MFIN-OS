import { describe, expect, it } from "vitest";

import { scheduledRunId } from "./scheduled-run";

describe("scheduled run capability", () => {
  it("accepts a database-generated UUID v4", () => {
    const value = "8e8a2f2c-7ed8-4d69-9649-f8adbab88a1b";
    expect(scheduledRunId(value)).toBe(value);
  });

  it("rejects missing and malformed identifiers", () => {
    expect(scheduledRunId(null)).toBeNull();
    expect(scheduledRunId("gmail-scheduled:20260824T1700")).toBeNull();
    expect(scheduledRunId("../../secret")).toBeNull();
  });
});
