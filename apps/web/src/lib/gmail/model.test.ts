import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { opportunityMatchesMail, projectGmailMessage } from "./model";

function encoded(value: string) {
  return Buffer.from(value).toString("base64url");
}

describe("mail_rules_v1", () => {
  beforeEach(() => {
    vi.stubEnv("GMAIL_JOB_FORWARD_IDENTIFIERS", "job-forward@example.com");
    vi.stubEnv("GMAIL_PERSONAL_FORWARD_IDENTIFIERS", "personal-forward@example.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does not classify mail from an empty forwarding identifier", () => {
    vi.stubEnv("GMAIL_JOB_FORWARD_IDENTIFIERS", "");
    vi.stubEnv("GMAIL_PERSONAL_FORWARD_IDENTIFIERS", "");
    const result = projectGmailMessage({
      id: "msg-empty", threadId: "thread-empty", historyId: "100", internalDate: "1786550400000",
      snippet: "A neutral note", payload: { headers: [{ name: "Subject", value: "Hello" }] }
    });
    expect(result.sourceIdentity).toBe("unknown");
    expect(result.classification).toBe("pending");
  });
  it("recognizes an explicit interview with a date without retaining raw payload fields", () => {
    const result = projectGmailMessage({
      id: "msg-1", threadId: "thread-1", historyId: "100", internalDate: "1786550400000",
      snippet: "We invite you to interview on 2026-08-20 14:30.",
      payload: {
        headers: [
          { name: "Subject", value: "Acme Analyst interview invitation" },
          { name: "From", value: "Recruiting <jobs@acme.example>" },
          { name: "X-Original-To", value: "job-forward@example.com" }
        ],
        parts: [{ mimeType: "text/plain", body: { data: encoded("Acme Analyst interview invitation on 2026-08-20 14:30") } }]
      }
    });
    expect(result.classification).toBe("job");
    expect(result.isInterviewInvitation).toBe(true);
    expect(result.confidence).toBe(0.98);
    expect(result.actionDueAt).toBe("2026-08-20T06:30:00.000Z");
    expect(result.ruleVersion).toBe("mail_rules_v1");
  });

  it("stores only an action-level summary for personal mail", () => {
    const result = projectGmailMessage({
      id: "msg-2", threadId: "thread-2", historyId: "101", internalDate: "1786550400000",
      snippet: "Private appointment details that must not be copied in full.",
      payload: { headers: [
        { name: "Subject", value: "Appointment confirmation" },
        { name: "Delivered-To", value: "personal-forward@example.com" }
      ] }
    });
    expect(result.classification).toBe("personal");
    expect(result.summary).toContain("个人事项");
    expect(result.summary).not.toContain("Private appointment details");
  });

  it("requires one exact company and role match before automatic updating", () => {
    const mail = { subject: "Acme Analyst interview", body: "Invitation for Acme Analyst" };
    expect(opportunityMatchesMail({ id: "1", company: "Acme", role_title: "Analyst" }, mail)).toBe(true);
    expect(opportunityMatchesMail({ id: "2", company: "Acme", role_title: "Associate" }, mail)).toBe(false);
  });
});
