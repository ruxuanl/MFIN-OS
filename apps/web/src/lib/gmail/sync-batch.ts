import type { GmailHistoryPage, GmailMessagePage } from "./google-gmail";

export type SyncCheckpoint = {
  mode: "full" | "history";
  anchor: string;
  historyId: string | null;
  pageToken?: string;
  loaded: boolean;
  pending: string[];
  backfillApproved?: boolean;
  fullProcessed?: number;
};

type BatchDependencies = {
  history: (historyId: string, pageToken?: string) => Promise<GmailHistoryPage>;
  messages: (pageToken?: string) => Promise<GmailMessagePage>;
  persist: (id: string, fullSync: boolean) => Promise<void>;
  save: (state: SyncCheckpoint) => Promise<void>;
  expiredHistory: () => Promise<string>;
  isNotFound: (error: unknown) => boolean;
  now?: () => number;
};

// Checkpoint message IDs before processing and acknowledge only after persistence.
// A crash can replay an ID, which the projection RPC deduplicates; it cannot skip one.
export async function runSyncBatch(state: SyncCheckpoint, deps: BatchDependencies) {
  const now = deps.now ?? Date.now;
  const deadline = now() + 25_000;
  let processed = 0;
  let pages = 0;
  while (now() < deadline && processed < 20 && pages < 5) {
    if (state.mode === "full" && !state.backfillApproved && (state.fullProcessed ?? 0) >= 50
      && (state.pending.length > 0 || state.pageToken)) {
      return { complete: false, processed, state, needsConfirmation: true };
    }
    if (state.pending.length) {
      const id = state.pending[0];
      try { await deps.persist(id, state.mode === "full"); }
      catch (error) { if (!deps.isNotFound(error)) throw error; }
      state.pending.shift();
      if (state.mode === "full") state.fullProcessed = (state.fullProcessed ?? 0) + 1;
      processed += 1;
      await deps.save(state);
      continue;
    }
    if (state.loaded && !state.pageToken) return { complete: true, processed, state };
    let ids: string[];
    let next: string | undefined;
    if (state.mode === "history") {
      try {
        const page = await deps.history(state.historyId!, state.pageToken);
        ids = (page.history ?? []).flatMap((h) => (h.messagesAdded ?? []).flatMap((a) => a.message?.id ? [a.message.id] : []));
        next = page.nextPageToken;
      } catch (error) {
        if (!deps.isNotFound(error)) throw error;
        state = { mode: "full", anchor: await deps.expiredHistory(), historyId: null, loaded: false, pending: [] };
        await deps.save(state);
        continue;
      }
    } else {
      const page = await deps.messages(state.pageToken);
      ids = (page.messages ?? []).flatMap((m) => m.id ? [m.id] : []);
      next = page.nextPageToken;
    }
    state = { ...state, loaded: true, pageToken: next, pending: [...new Set(ids)] };
    await deps.save(state);
    pages += 1;
  }
  return { complete: state.loaded && !state.pageToken && !state.pending.length, processed, state };
}
