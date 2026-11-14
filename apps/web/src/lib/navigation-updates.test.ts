import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { deriveNavigationUpdateHrefs, type NavigationUpdateSnapshot } from "./navigation-update-model";

const emptySnapshot: NavigationUpdateSnapshot = {
  academicInbox: 0,
  calendarConflicts: 0,
  calendarOperations: 0,
  connectionErrors: 0,
  graduateCandidates: 0,
  internshipCandidates: 0,
  pendingInbox: 0,
  sourceErrors: 0,
  unreadNotifications: 0
};

describe("navigation update indicators", () => {
  it("shows no indicator when there is nothing outstanding", () => {
    expect([...deriveNavigationUpdateHrefs(emptySnapshot)]).toEqual([]);
  });

  it("maps outstanding work to the relevant destinations", () => {
    const hrefs = deriveNavigationUpdateHrefs({
      ...emptySnapshot,
      academicInbox: 1,
      calendarConflicts: 2,
      connectionErrors: 1,
      graduateCandidates: 3,
      internshipCandidates: 4,
      pendingInbox: 2,
      unreadNotifications: 1
    });

    expect([...hrefs].sort()).toEqual([
      "/academics",
      "/calendar",
      "/graduate",
      "/inbox",
      "/internships",
      "/review",
      "/status"
    ]);
  });

  it("combines multiple signals without duplicating a destination", () => {
    const hrefs = deriveNavigationUpdateHrefs({
      ...emptySnapshot,
      calendarConflicts: 1,
      calendarOperations: 1,
      connectionErrors: 1,
      sourceErrors: 1
    });

    expect([...hrefs]).toEqual(["/calendar", "/status"]);
  });

  it("renders update dots and keeps notification read receipts owner-scoped", () => {
    const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const activeLink = readFileSync(new URL("../components/active-link.tsx", import.meta.url), "utf8");
    const readReceipt = readFileSync(new URL("../components/notification-read-receipt.tsx", import.meta.url), "utf8");
    const reportActions = readFileSync(new URL("../app/(app)/reports/actions.ts", import.meta.url), "utf8");

    expect(styles).toContain(".navigation-update-dot {");
    expect(activeLink).toContain('className="navigation-update-dot"');
    expect(readReceipt).toContain("markReportNotificationsRead");
    expect(readReceipt).toContain("router.refresh()");
    expect(reportActions).toContain('.eq("user_id", user.id)');
    expect(reportActions).toContain('.is("read_at", null)');
  });
});
