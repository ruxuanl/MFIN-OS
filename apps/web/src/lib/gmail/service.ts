import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { createServiceClient } from "@/lib/supabase/service";

import {
  GMAIL_ATTACHMENT_BUCKET,
  GMAIL_ATTACHMENT_LIMIT,
  GMAIL_INITIAL_LIMIT,
  GMAIL_INITIAL_QUERY,
  GMAIL_READONLY_SCOPE
} from "./constants";
import { GmailProviderError, GoogleGmailClient } from "./google-gmail";
import { opportunityMatchesMail, projectGmailMessage, type MailProjection } from "./model";
import {
  refreshGmailAccessToken,
  revokeGmailToken,
  type GmailCredentials,
  type GmailOAuthConfig
} from "./oauth";

import { runSyncBatch, type SyncCheckpoint } from "./sync-batch";
import type { Json } from "@/lib/supabase/database.types";

export type GmailSyncResult = { fetched: number; created: number; pending: number; updated: number; fullSync: boolean; complete: boolean; needsConfirmation?: boolean };

async function readCredentials(userId: string): Promise<GmailCredentials> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("read_gmail_oauth_credentials", { target_user_id: userId });
  if (error || !data) throw new Error(error?.message || "gmail_credentials_unavailable");
  const credentials = JSON.parse(data) as GmailCredentials;
  if (!credentials.accessToken || !credentials.refreshToken || !credentials.expiresAt) {
    throw new Error("gmail_credentials_invalid");
  }
  return credentials;
}

async function storeCredentials(userId: string, credentials: GmailCredentials) {
  const service = createServiceClient();
  const { error } = await service.rpc("store_gmail_oauth_credentials", {
    target_user_id: userId,
    target_secret_payload: JSON.stringify(credentials),
    target_scopes: credentials.scope,
    target_expires_at: credentials.expiresAt
  });
  if (error) throw error;
}

async function freshCredentials(userId: string, oauth: GmailOAuthConfig) {
  let credentials = await readCredentials(userId);
  if (credentials.scope.length !== 1 || credentials.scope[0] !== GMAIL_READONLY_SCOPE) {
    throw new Error("gmail_scope_not_readonly");
  }
  if (new Date(credentials.expiresAt).getTime() <= Date.now() + 60_000) {
    credentials = await refreshGmailAccessToken(oauth, credentials);
    await storeCredentials(userId, credentials);
  }
  return credentials;
}

async function permissionDecision(userId: string, capabilityKey: string) {
  const service = createServiceClient();
  const [capability, grant, dependencies, grants, connection, lock] = await Promise.all([
    service.from("capability_definitions").select("requires_ai,connection_provider").eq("capability_key", capabilityKey).maybeSingle(),
    service.from("permission_grants").select("mode,active,starts_at,expires_at").eq("user_id", userId).eq("capability_key", capabilityKey).maybeSingle(),
    service.from("capability_dependencies").select("required_capability_key").eq("capability_key", capabilityKey),
    service.from("permission_grants").select("capability_key,mode,active,starts_at,expires_at").eq("user_id", userId),
    service.from("external_connections").select("provider,status").eq("user_id", userId),
    service.from("privacy_locks").select("is_locked").eq("user_id", userId).maybeSingle()
  ]);
  const error = [capability, grant, dependencies, grants, connection, lock].map((result) => result.error).find(Boolean);
  if (error) throw error;
  if (lock.data?.is_locked) return { allowed: false, reason: "privacy_locked" };
  if (!capability.data) return { allowed: false, reason: "unknown_capability" };
  const now = Date.now();
  const active = (value: { mode: string; active: boolean; starts_at: string; expires_at: string | null } | null) => Boolean(
    value?.active && value.mode !== "off" && new Date(value.starts_at).getTime() <= now &&
    (!value.expires_at || new Date(value.expires_at).getTime() > now)
  );
  if (!active(grant.data)) return { allowed: false, reason: "grant_inactive" };
  if (capability.data.connection_provider) {
    const provider = connection.data?.find((item) => item.provider === capability.data!.connection_provider);
    if (provider?.status !== "connected") return { allowed: false, reason: "connection_unavailable" };
  }
  const grantMap = new Map((grants.data ?? []).map((item) => [item.capability_key, item]));
  for (const dependency of dependencies.data ?? []) {
    if (!active(grantMap.get(dependency.required_capability_key) ?? null)) {
      return { allowed: false, reason: `dependency_denied:${dependency.required_capability_key}` };
    }
  }
  return { allowed: true, reason: "allowed" };
}

async function assertGmailAccess(userId: string) {
  const decision = await permissionDecision(userId, "gmail.sync");
  if (!decision.allowed) throw new Error(`gmail_permission_${decision.reason}`);
}

function decodeAttachment(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

// PostgREST accepts SQL-null function arguments, while generated RPC types do
// not currently preserve that nullability. Keep the runtime value unchanged.
function nullableRpcText(value: string | null) {
  return value as string;
}

async function persistMessage(userId: string, projection: MailProjection, client: GoogleGmailClient, allowAutomaticUpdates = true) {
  const service = createServiceClient();
  const pending = projection.classification === "pending" || projection.confidence < 0.8;
  let targetId: string | null = null;
  if (projection.isInterviewInvitation) {
    const { data: opportunities, error } = await service.from("opportunities")
      .select("id,company,role_title").eq("user_id", userId).eq("record_state", "active");
    if (error) throw error;
    const matches = (opportunities ?? []).filter((item) => opportunityMatchesMail(item, projection));
    if (matches.length === 1) targetId = matches[0].id;
  }
  const autoEligible = Boolean(allowAutomaticUpdates && targetId && projection.isInterviewInvitation && projection.confidence >= 0.98);
  const itemType = projection.isInterviewInvitation ? "email_update" : projection.needsAction ? "email_action" : "email_information";
  const inboxClassification = projection.classification === "pending" || projection.classification === "irrelevant"
    ? "pending" : projection.classification;
  const { data: persisted, error: persistError } = await service.rpc("store_gmail_projection", {
    target_user_id: userId,
    target_provider_message_id: projection.providerMessageId,
    target_provider_thread_id: projection.providerThreadId,
    target_history_id: projection.historyId,
    target_received_at: projection.receivedAt,
    target_source_identity: projection.sourceIdentity,
    target_classification: projection.classification,
    target_sender_summary: nullableRpcText(projection.senderSummary),
    target_subject: projection.subject,
    target_summary: nullableRpcText(projection.summary),
    target_gmail_link: projection.gmailLink,
    target_needs_action: projection.needsAction,
    target_action_title: nullableRpcText(projection.actionTitle),
    target_action_due_at: nullableRpcText(projection.actionDueAt),
    target_confidence: projection.confidence,
    target_evidence_excerpt: nullableRpcText(projection.evidenceExcerpt),
    target_content_hash: projection.contentHash,
    target_item_type: itemType,
    target_inbox_classification: inboxClassification,
    target_inbox_title: (projection.actionTitle ?? projection.subject) || "邮件信息",
    target_inbox_summary: projection.summary ?? "邮件已按最小数据原则保存。",
    target_target_type: nullableRpcText(targetId ? "opportunity" : null),
    target_target_id: nullableRpcText(targetId),
    target_attachments: projection.attachments
  });
  if (persistError) throw persistError;
  const stored = persisted?.[0];
  if (!stored) throw new Error("gmail_projection_not_returned");
  if (!stored.created) return { created: false, pending: false, updated: false };

  const { data: storedAttachments, error: attachmentsError } = await service.from("gmail_attachments")
    .select("id,provider_attachment_id,filename,mime_type,size_bytes")
    .eq("user_id", userId).eq("gmail_message_id", stored.gmail_message_id);
  if (attachmentsError) throw attachmentsError;
  for (const storedAttachment of storedAttachments ?? []) {
    const attachment = projection.attachments.find((item) => item.providerAttachmentId === storedAttachment.provider_attachment_id);
    if (!attachment) continue;
    const attachmentDecision = await permissionDecision(userId, "gmail.attachment_import");
    if (attachmentDecision.allowed && attachment.size <= GMAIL_ATTACHMENT_LIMIT) {
      try {
        await assertGmailAccess(userId);
        const payload = await client.getAttachment(projection.providerMessageId, attachment.providerAttachmentId);
        if (!payload.data) throw new Error("gmail_attachment_data_missing");
        const buffer = decodeAttachment(payload.data);
        if (buffer.byteLength > GMAIL_ATTACHMENT_LIMIT) throw new Error("gmail_attachment_too_large");
        const safeName = attachment.filename.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 180) || "attachment";
        const path = `${userId}/${stored.gmail_message_id}/${storedAttachment.id}-${safeName}`;
        const { error: uploadError } = await service.storage.from(GMAIL_ATTACHMENT_BUCKET).upload(path, buffer, {
          contentType: attachment.mimeType,
          upsert: false
        });
        if (uploadError) throw uploadError;
        const { error: updateError } = await service.from("gmail_attachments").update({
          storage_path: path,
          content_sha256: createHash("sha256").update(buffer).digest("hex"),
          import_status: "imported",
          imported_at: new Date().toISOString()
        }).eq("id", storedAttachment.id);
        if (updateError) throw updateError;
      } catch {
        await service.from("gmail_attachments").update({
          import_status: "failed", failure_code: "attachment_import_failed"
        }).eq("id", storedAttachment.id);
      }
    }
  }

  let updated = false;
  if (autoEligible && targetId) {
    const decision = await permissionDecision(userId, "gmail.rules_status_update");
    if (decision.allowed) {
      const { error } = await service.rpc("apply_gmail_interview_update", {
        target_user_id: userId,
        target_inbox_item_id: stored.inbox_item_id,
        target_opportunity_id: targetId
      });
      if (error) throw error;
      updated = true;
    }
  }
  return { created: true, pending: pending || (projection.isInterviewInvitation && !updated), updated };
}

export async function initializeGmailConnection(userId: string, credentials: GmailCredentials) {
  if (credentials.scope.length !== 1 || credentials.scope[0] !== GMAIL_READONLY_SCOPE) {
    throw new Error("gmail_scope_not_readonly");
  }
  await storeCredentials(userId, credentials);
}

export async function runGmailSync(userId: string, oauth: GmailOAuthConfig): Promise<GmailSyncResult> {
  await assertGmailAccess(userId);
  const service = createServiceClient();
  const token = randomUUID();
  const { data: claimed, error: claimError } = await service.rpc("claim_gmail_sync_work", { target_user_id: userId, target_token: token });
  if (claimError) throw claimError;
  if (!claimed) throw new Error("gmail_sync_busy");
  let state = (claimed as { state: SyncCheckpoint | null }).state;
  const save = async (value: SyncCheckpoint | null, release = false) => {
    const { error } = await service.rpc("save_gmail_sync_work", {
      target_user_id: userId, target_token: token, target_state: value as unknown as Json, target_release: release
    });
    if (error) throw error;
    state = value;
  };
  try {
    const credentials = await freshCredentials(userId, oauth);
    const client = new GoogleGmailClient(credentials.accessToken, fetch, () => assertGmailAccess(userId));
    if (!state) {
      const profile = await client.profile();
      if (!profile.historyId) throw new Error("gmail_profile_history_missing");
      const { data, error } = await service.rpc("get_gmail_sync_cursor", { target_user_id: userId });
      if (error) throw error;
      const historyId = data?.[0]?.history_id ?? null;
      await save({ mode: historyId ? "history" : "full", historyId, anchor: profile.historyId, pending: [], loaded: false });
    }
    let created = 0, pending = 0, updated = 0;
    const batch = await runSyncBatch(state!, {
      history: (id, page) => client.listHistory(id, page),
      messages: (page) => client.listMessages(GMAIL_INITIAL_QUERY, GMAIL_INITIAL_LIMIT, page),
      save: (value) => save(value),
      expiredHistory: async () => {
        const profile = await client.profile();
        if (!profile.historyId) throw new Error("gmail_profile_history_missing");
        return profile.historyId;
      },
      isNotFound: (error) => error instanceof GmailProviderError && error.status === 404,
      persist: async (id, fullSync) => {
        const projection = projectGmailMessage(await client.getMessage(id));
        const result = await persistMessage(userId, projection, client, !fullSync);
        created += Number(result.created); pending += Number(result.pending); updated += Number(result.updated);
      }
    });
    if (batch.complete) {
      await assertGmailAccess(userId);
      const { error } = await service.rpc("set_gmail_sync_cursor", {
        target_user_id: userId, target_history_id: batch.state.anchor, target_full_sync: batch.state.mode === "full"
      });
      if (error) throw error;
      const { error: connectionError } = await service.from("external_connections").update({
        last_success_at: new Date().toISOString(), last_error_code: null, last_error_at: null
      }).eq("user_id", userId).eq("provider", "gmail").select("id").single();
      if (connectionError) throw connectionError;
    }
    if (batch.needsConfirmation) {
      const { error } = await service.from("external_connections").update({
        last_error_code: "gmail_backfill_confirmation_required", last_error_at: new Date().toISOString()
      }).eq("user_id", userId).eq("provider", "gmail");
      if (error) throw error;
    }
    await save(batch.complete ? null : batch.state, true);
    return { fetched: batch.processed, created, pending, updated, fullSync: batch.state.mode === "full", complete: batch.complete, needsConfirmation: batch.needsConfirmation };
  } catch (error) {
    // Persisted work survives failures; release is fenced by the lease token.
    await save(state, true).catch(() => undefined);
    throw error;
  }
}

export async function disconnectGmail(userId: string) {
  let credentials: GmailCredentials | null = null;
  try { credentials = await readCredentials(userId); } catch { /* local deletion still proceeds */ }
  let remoteRevoked = false;
  if (credentials) {
    try { await revokeGmailToken(credentials.refreshToken); remoteRevoked = true; } catch { remoteRevoked = false; }
  }
  const service = createServiceClient();
  const { error } = await service.rpc("delete_gmail_oauth_credentials", { target_user_id: userId });
  if (error) throw error;
  return { remoteRevoked };
}

export async function deleteImportedGmailAttachment(userId: string, attachmentId: string) {
  const service = createServiceClient();
  const { data, error } = await service.from("gmail_attachments").select("storage_path")
    .eq("id", attachmentId).eq("user_id", userId).eq("import_status", "imported").single();
  if (error || !data.storage_path) throw new Error(error?.message || "gmail_attachment_not_imported");
  const { error: removeError } = await service.storage.from(GMAIL_ATTACHMENT_BUCKET).remove([data.storage_path]);
  if (removeError) throw removeError;
  const { error: updateError } = await service.from("gmail_attachments").update({
    storage_path: null,
    content_sha256: null,
    import_status: "deleted",
    imported_at: null,
    deleted_at: new Date().toISOString(),
    failure_code: null
  }).eq("id", attachmentId).eq("user_id", userId);
  if (updateError) throw updateError;
}
