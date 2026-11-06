"use client";

import { useEffect } from "react";

import { saveWorkspaceSnapshot, type WorkspaceSnapshot } from "@/lib/workspaces/outbox";

export function WorkspaceSnapshotCache({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  useEffect(() => {
    void saveWorkspaceSnapshot(snapshot);
  }, [snapshot]);
  return null;
}
