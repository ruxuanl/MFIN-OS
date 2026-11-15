import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), user: { id: "synthetic-user", isMock: false }, revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import { changeMailTask } from "./actions";
const itemId = "88888888-8888-4888-8888-888888888841";
function query(data: unknown) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data, error: null }), single: async () => ({ data, error: null }) };
  return chain;
}
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { conflictCount: 0 }, error: null }); });
it("extracts through the existing evidence-linked inbox transaction", async () => {
  mocks.from.mockReturnValue(query({ id: itemId, action_id: null, status: "pending", item_type: "email_action" }));
  expect(await changeMailTask({ itemId, actionId: null, version: 0, status: "unscheduled" })).toEqual({ error: null });
  expect(mocks.rpc).toHaveBeenCalledWith("resolve_my_inbox_item", { target_item_id: itemId, target_resolution: "accept" });
});
it("persists independent progress via the audited optimistic mutation, not Gmail read flags", async () => {
  mocks.from.mockImplementation((table) => query(table === "inbox_items" ? { id: itemId, action_id: "action", status: "accepted" } : { status: "unscheduled", version: 2 }));
  expect(await changeMailTask({ itemId, actionId: "action", version: 2, status: "completed" })).toEqual({ error: null });
  expect(mocks.rpc).toHaveBeenCalledWith("apply_workspace_mutation", expect.objectContaining({ target_object_id: "action", target_base_version: 2, target_patch: { status: "completed" } }));
});
it("rejects stale cards and an action ID not owned by this inbox item", async () => {
  mocks.from.mockImplementation((table) => query(table === "inbox_items" ? { id: itemId, action_id: "action", status: "accepted" } : { status: "waiting", version: 3 }));
  expect((await changeMailTask({ itemId, actionId: "action", version: 2, status: "completed" })).error).toBeTruthy();
  expect((await changeMailTask({ itemId, actionId: "other", version: 3, status: "completed" })).error).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not report success or invalidate caches after a privacy / database rejection", async () => {
  mocks.from.mockReturnValue(query({ id: itemId, action_id: null, status: "pending", item_type: "email_action" }));
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "privacy_locked" } });
  expect((await changeMailTask({ itemId, actionId: null, version: 0, status: "unscheduled" })).error).toBeTruthy();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("only extracts a recruitment-update task when the source message has action evidence", async () => {
  mocks.from.mockImplementation((table) => query(table === "inbox_items" ? { id: itemId, action_id: null, status: "pending", item_type: "email_update", gmail_message_id: "message" } : { needs_action: false }));
  expect((await changeMailTask({ itemId, actionId: null, version: 0, status: "unscheduled" })).error).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.from.mockImplementation((table) => query(table === "inbox_items" ? { id: itemId, action_id: null, status: "pending", item_type: "email_update", gmail_message_id: "message" } : { needs_action: true }));
  expect(await changeMailTask({ itemId, actionId: null, version: 0, status: "unscheduled" })).toEqual({ error: null });
});
