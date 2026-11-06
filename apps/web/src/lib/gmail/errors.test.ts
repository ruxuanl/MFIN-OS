import { describe, expect, it } from "vitest";

import { displayableGmailErrorCode, safeGmailErrorCode } from "./errors";

describe("Gmail error codes", () => {
  it("preserves provider status codes without provider response bodies", () => {
    expect(safeGmailErrorCode(new Error("gmail_api_403"))).toBe("gmail_api_403");
  });

  it("replaces unsafe exception text", () => {
    expect(safeGmailErrorCode(new Error("request failed for user@example.com"))).toBe("gmail_sync_failed");
  });

  it("only exposes codes in the Gmail namespace", () => {
    expect(displayableGmailErrorCode("gmail_profile_history_missing")).toBe("gmail_profile_history_missing");
    expect(displayableGmailErrorCode("token=secret")).toBeNull();
  });
});
