"use client";

import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import type { MutationResult, PendingMutation } from "@/lib/workspaces/model";

const DATABASE_NAME = "mfin-workspace-v1";
const DATABASE_VERSION = 1;
const MUTATION_STORE = "mutations";
const SNAPSHOT_STORE = "snapshots";
const DEVICE_KEY = "mfin-workspace-device";

export type WorkspaceSnapshot = {
  scope: string;
  updatedAt: string;
  records: Array<{ id: string; title: string; subtitle?: string; href: string }>;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MUTATION_STORE)) {
        database.createObjectStore(MUTATION_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "scope" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const deviceId = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, deviceId);
  return deviceId;
}

export async function enqueueMutation(mutation: PendingMutation) {
  const database = await openDatabase();
  await requestResult(database.transaction(MUTATION_STORE, "readwrite").objectStore(MUTATION_STORE).put(mutation));
  database.close();
  window.dispatchEvent(new Event("mfin:outbox-changed"));
}

export async function listMutations() {
  const database = await openDatabase();
  const mutations = await requestResult<PendingMutation[]>(
    database.transaction(MUTATION_STORE).objectStore(MUTATION_STORE).getAll()
  );
  database.close();
  return mutations.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function removeMutation(id: string) {
  const database = await openDatabase();
  await requestResult(database.transaction(MUTATION_STORE, "readwrite").objectStore(MUTATION_STORE).delete(id));
  database.close();
}

export async function flushOutbox() {
  if (!navigator.onLine) return { processed: 0, conflicts: 0 };
  const supabase = createClient();
  const mutations = await listMutations();
  let processed = 0;
  let conflicts = 0;

  for (const mutation of mutations) {
    const { data, error } = await supabase.rpc("apply_workspace_mutation", {
      target_mutation_id: mutation.id,
      target_device_id: mutation.deviceId,
      target_object_type: mutation.objectType,
      target_object_id: mutation.objectId,
      target_base_version: mutation.baseVersion,
      target_base_values: mutation.baseValues as Json,
      target_patch: mutation.patch as Json
    });
    if (error) break;
    const result = data as unknown as MutationResult;
    if (result.conflictCount > 0) conflicts += result.conflictCount;
    await removeMutation(mutation.id);
    processed += 1;
  }

  window.dispatchEvent(new Event("mfin:outbox-changed"));
  return { processed, conflicts };
}

export async function saveWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  const database = await openDatabase();
  await requestResult(database.transaction(SNAPSHOT_STORE, "readwrite").objectStore(SNAPSHOT_STORE).put(snapshot));
  database.close();
}

export async function listWorkspaceSnapshots() {
  const database = await openDatabase();
  const snapshots = await requestResult<WorkspaceSnapshot[]>(
    database.transaction(SNAPSHOT_STORE).objectStore(SNAPSHOT_STORE).getAll()
  );
  database.close();
  return snapshots.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
