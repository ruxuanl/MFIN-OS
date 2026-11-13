import { describe, expect, it } from "vitest";

import { displayableGmailErrorCode, gmailOAuthFailureNotice, safeGmailErrorCode } from "./errors";

describe("Gmail error codes", () => {
  it.each([
    ["gmail_oauth_invalid_client", "oauth_client_invalid"],
    ["gmail_oauth_invalid_grant", "oauth_code_expired"],
    ["gmail_oauth_scope_expanded", "oauth_scope_invalid"],
    ["gmail_oauth_incomplete_credentials", "oauth_credentials_incomplete"],
    ["private account detail", "connection_failed"]
  ])("maps %s to a recoverable OAuth notice without exposing exception details", (code, notice) => {
    expect(gmailOAuthFailureNotice(new Error(code))).toBe(notice);
  });
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
