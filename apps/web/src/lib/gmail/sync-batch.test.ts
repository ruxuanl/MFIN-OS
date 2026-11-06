import { describe, expect, it, vi } from "vitest";
import { runSyncBatch, type SyncCheckpoint } from "./sync-batch";

function state(): SyncCheckpoint {
  return { mode: "history", anchor: "200", historyId: "100", loaded: false, pending: [] };
}
function harness() {
  return {
    history: vi.fn().mockResolvedValue({ history: [] }),
    messages: vi.fn().mockResolvedValue({ messages: [] }),
    persist: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    expiredHistory: vi.fn().mockResolvedValue("300"),
    isNotFound: (error: unknown) => error === "404"
  };
}
describe("durable Gmail batches", () => {
  it("requires approval after 50 historical messages and resumes when approved", async () => {
    const deps = harness();
    const work: SyncCheckpoint = { ...state(), mode: "full", fullProcessed: 50, loaded: true, pending: ["older"] };
    const stopped = await runSyncBatch(work, deps);
    expect(stopped.needsConfirmation).toBe(true);
    expect(deps.persist).not.toHaveBeenCalled();
    const resumed = await runSyncBatch({ ...stopped.state, backfillApproved: true }, deps);
    expect(resumed.complete).toBe(true);
    expect(deps.persist).toHaveBeenCalledWith("older", true);
  });
  it("checkpoints IDs before processing and completes empty history", async () => {
    const deps = harness();
    const result = await runSyncBatch(state(), deps);
    expect(result.complete).toBe(true);
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ loaded: true, pending: [] }));
  });
  it("bounds work and resumes every ID without dropping a page", async () => {
    const deps = harness();
    deps.history.mockResolvedValue({ history: [{ messagesAdded: Array.from({ length: 25 }, (_, n) => ({ message: { id: String(n) } })) }] });
    const first = await runSyncBatch(state(), deps);
    expect(first.complete).toBe(false);
    expect(first.state.pending).toHaveLength(5);
    const second = await runSyncBatch(first.state, deps);
    expect(second.complete).toBe(true);
    expect(deps.history).toHaveBeenCalledTimes(1);
    expect(deps.persist.mock.calls.map((c) => c[0])).toEqual(Array.from({ length: 25 }, (_, n) => String(n)));
  });
  it("saves pending IDs before attempting the first projection", async () => {
    const deps = harness();
    deps.history.mockResolvedValue({ history: [{ messagesAdded: [{ message: { id: "one" } }] }] });
    deps.persist.mockRejectedValue(new Error("network_failed"));
    await expect(runSyncBatch(state(), deps)).rejects.toThrow("network_failed");
    expect(deps.save.mock.invocationCallOrder[0]).toBeLessThan(deps.persist.mock.invocationCallOrder[0]);
    expect(deps.save.mock.calls[0][0].pending).toEqual(["one"]);
  });
  it("skips a deleted individual message but continues with the next", async () => {
    const deps = harness();
    deps.persist.mockRejectedValueOnce("404");
    const result = await runSyncBatch({ ...state(), loaded: true, pending: ["deleted", "live"] }, deps);
    expect(result.complete).toBe(true);
    expect(deps.persist).toHaveBeenCalledTimes(2);
    expect(deps.messages).not.toHaveBeenCalled();
  });
  it("falls back only for expired history and marks backfill as non-automatic", async () => {
    const deps = harness();
    deps.history.mockRejectedValueOnce("404");
    deps.messages.mockResolvedValue({ messages: [{ id: "old" }] });
    const result = await runSyncBatch(state(), deps);
    expect(result.state.anchor).toBe("300");
    expect(deps.persist).toHaveBeenCalledWith("old", true);
  });
  it("traverses pages, deduplicates within a page, and preserves the anchor", async () => {
    const deps = harness();
    deps.history.mockResolvedValueOnce({ nextPageToken: "next", history: [{ messagesAdded: [{ message: { id: "one" } }, { message: { id: "one" } }] }] }).mockResolvedValueOnce({ historyId: "999", history: [] });
    const result = await runSyncBatch(state(), deps);
    expect(result.complete).toBe(true);
    expect(result.state.anchor).toBe("200");
    expect(deps.history).toHaveBeenLastCalledWith("100", "next");
    expect(deps.persist).toHaveBeenCalledTimes(1);
  });
  it("retains pending work when permission or persistence fails", async () => {
    const deps = harness();
    deps.persist.mockRejectedValue(new Error("permission_denied"));
    const work = { ...state(), loaded: true, pending: ["one"] };
    await expect(runSyncBatch(work, deps)).rejects.toThrow("permission_denied");
    expect(work.pending).toEqual(["one"]);
  });
  it("stops before processing when the time budget has elapsed", async () => {
    const deps = harness();
    let tick = 0;
    const result = await runSyncBatch(state(), { ...deps, now: () => tick++ * 30_000 });
    expect(result.complete).toBe(false);
    expect(deps.persist).not.toHaveBeenCalled();
  });
});
