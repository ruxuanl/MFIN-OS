import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(), insert: vi.fn(), sync: vi.fn(), mock: false
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error(url), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "synthetic-user", isMock: state.mock }), hasFreshReauthentication: async () => true }));
vi.mock("@/lib/config", () => ({ isCalendarServerConfigured: () => true, getCalendarOAuthConfig: () => ({}) }));
vi.mock("@/lib/calendar/service", () => ({ runCalendarSync: state.sync, disconnectCalendar: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: state.rpc,
  from: () => ({ insert: (values: unknown) => {
    state.insert(values);
    return { select: () => ({ single: async () => ({ data: { id: "new-action" }, error: null }) }) };
  } })
}) }));

import { createScheduledAction, queueCalendarAction } from "@/app/(app)/calendar/actions";

beforeEach(() => {
  state.mock = false;
  state.rpc.mockReset().mockResolvedValue({ error: null });
  state.insert.mockReset();
  state.sync.mockReset().mockResolvedValue({ pendingOperations: 0, conflicts: 0 });
});

describe("Calendar explicit confirmation flow", () => {
  it("saves a draft without queueing or contacting Google", async () => {
    const form = new FormData(); form.set("title", "Synthetic preparation"); form.set("intent", "draft");
    await expect(createScheduledAction(form)).rejects.toThrow("notice=action_created");
    expect(state.insert).toHaveBeenCalledOnce();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.sync).not.toHaveBeenCalled();
  });
  it("creates in Hong Kong time and immediately syncs only after confirmation", async () => {
    const form = new FormData(); form.set("title", "Synthetic preparation"); form.set("intent", "sync");
    form.set("suggestedStartAt", "2026-11-16T09:00");
    await expect(createScheduledAction(form)).rejects.toThrow("notice=synced");
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ suggested_start_at: "2026-11-16T01:00:00.000Z" }));
    expect(state.rpc).toHaveBeenCalledWith("queue_action_calendar_sync", { target_action_id: "new-action", target_all_day: false });
    expect(state.sync).toHaveBeenCalledOnce();
  });
  it("does not create an unschedulable action when confirming", async () => {
    const form = new FormData(); form.set("title", "Synthetic preparation"); form.set("intent", "sync");
    await expect(createScheduledAction(form)).rejects.toThrow("notice=schedule_required");
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("stops before Google if queue permission or privacy validation fails", async () => {
    state.rpc.mockResolvedValue({ error: { message: "privacy_locked" } });
    const form = new FormData(); form.set("actionId", "existing");
    await expect(queueCalendarAction(form)).rejects.toThrow("notice=queue_failed");
    expect(state.sync).not.toHaveBeenCalled();
  });
  it("keeps a queued item visibly pending when the write grant is off", async () => {
    state.sync.mockResolvedValue({ pendingOperations: 1, conflicts: 0 });
    const form = new FormData(); form.set("actionId", "existing");
    await expect(queueCalendarAction(form)).rejects.toThrow("notice=sync_pending");
  });
  it("reports expired Google credentials without claiming success or inserting again", async () => {
    state.sync.mockRejectedValue(new Error("calendar_oauth_invalid_grant"));
    const form = new FormData(); form.set("actionId", "existing");
    await expect(queueCalendarAction(form)).rejects.toThrow("notice=reauthorization_required");
    expect(state.insert).not.toHaveBeenCalled();
  });
});
