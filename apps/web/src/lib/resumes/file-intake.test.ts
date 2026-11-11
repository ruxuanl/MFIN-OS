import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  RESUME_FILE_LIMIT,
  ResumeFileValidationError,
  validateResumeFileBytes
} from "./file-intake";

describe("resume file intake", () => {
  it("accepts PDF and DOCX signatures for the declared types", () => {
    expect(validateResumeFileBytes(
      Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
      "application/pdf"
    )).toBe("application/pdf");
    expect(validateResumeFileBytes(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )).toContain("wordprocessingml");
  });

  it("rejects spoofed and unsupported files", () => {
    expect(() => validateResumeFileBytes(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), "application/pdf"
    )).toThrowError(new ResumeFileValidationError("type_mismatch"));
    expect(() => validateResumeFileBytes(
      Uint8Array.from([1]), "text/plain"
    )).toThrowError(new ResumeFileValidationError("unsupported_type"));
  });

  it("enforces empty and ten-megabyte boundaries", () => {
    expect(() => validateResumeFileBytes(new Uint8Array(), "application/pdf"))
      .toThrowError(new ResumeFileValidationError("empty"));
    const oversized = new Uint8Array(RESUME_FILE_LIMIT + 1);
    expect(() => validateResumeFileBytes(oversized, "application/pdf"))
      .toThrowError(new ResumeFileValidationError("too_large"));
  });
});
