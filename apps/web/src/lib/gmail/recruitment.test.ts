import { describe, expect, it } from "vitest";
import { authenticatedSender, detectRecruitmentStage, employerSenderMatches } from "./recruitment";
describe("conservative recruitment notifications", () => {
  it("accepts explicit allowlisted opened notices, never missing or negative reminders", () => {
    expect(detectRecruitmentStage("Email opened", "Your email Synthetic Analyst has been opened", "Mailtrack <notification@mailtrack.io>")).toBe("read_confirmed");
    expect(detectRecruitmentStage("Not opened reminder", "Your email has not yet been read", "notification@mailtrack.io")).toBeNull();
    expect(detectRecruitmentStage("已读提醒", "合成邮件已读", "attacker@example.invalid")).toBeNull();
    expect(detectRecruitmentStage("Application received", "Thanks for applying", "hr@example.invalid")).toBeNull();
  });
  it("requires aligned Google DMARC for automatic changes", () => {
    expect(authenticatedSender("HR <hr@synthetic.invalid>", "mx.google.com; dmarc=pass header.from=synthetic.invalid")).toBe(true);
    expect(authenticatedSender("hr@synthetic.invalid", "mx.google.com; dmarc=pass header.from=attacker.invalid")).toBe(false);
    expect(authenticatedSender("hr@synthetic.invalid", "attacker.invalid; dmarc=pass header.from=synthetic.invalid")).toBe(false);
    expect(authenticatedSender("hr@synthetic.invalid", "mx.google.com; dmarc=fail header.from=synthetic.invalid")).toBe(false);
  });
  it("requires employer domain evidence and explicit subject-stage language", () => {
    expect(employerSenderMatches("hr@synthetic.invalid", "https://careers.synthetic.invalid/job/1")).toBe(true);
    expect(employerSenderMatches("hr@elsewhere.invalid", "https://synthetic.invalid/job/1")).toBe(false);
    expect(employerSenderMatches("hr@gmail.com", "https://gmail.com/job/1")).toBe(false);
    expect(detectRecruitmentStage("Assessment invitation", "Synthetic", "hr@synthetic.invalid")).toBe("assessment");
    expect(detectRecruitmentStage("Newsletter", "Interview invitation from a quoted thread", "hr@synthetic.invalid")).toBeNull();
    expect(detectRecruitmentStage("Internship offer", "Synthetic", "hr@synthetic.invalid")).toBe("offer");
    expect(detectRecruitmentStage("Interview invitation cancelled", "Synthetic", "hr@synthetic.invalid")).toBeNull();
    expect(detectRecruitmentStage("Internship offer", "Your offer has been rescinded", "hr@synthetic.invalid")).toBeNull();
  });
});
