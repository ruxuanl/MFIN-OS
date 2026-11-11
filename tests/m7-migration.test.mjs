import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readMigrations() {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql") && name.includes("m7_")).sort();
  return (await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8")))).join("\n");
}

test("M7 stores only allowlisted minimal projections behind read-only RLS", async () => {
  const sql = await readMigrations();
  for (const table of ["wechat_allowlist_groups", "wechat_monitor_states", "wechat_projections"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /grant select on public\.wechat_allowlist_groups[\s\S]+to authenticated/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*wechat_projections[^;]*to authenticated/i);
  assert.doesNotMatch(sql, /raw_(screenshot|chat|message)|wechat_password|sender_profile|contact_list/i);
});

test("M7 ingestion rechecks permission, health, identity, heartbeat, and stop generation", async () => {
  const sql = await readMigrations();
  assert.match(sql, /private\.evaluate_permission\(target_user_id, 'wechat\.monitor', null\)/i);
  assert.match(sql, /group_record\.identity_fingerprint <> target_identity_fingerprint/i);
  assert.match(sql, /monitor_record\.observed_state <> 'healthy'/i);
  assert.match(sql, /monitor_record\.stop_generation <> target_stop_generation/i);
  assert.match(sql, /last_heartbeat_at < now\(\) - interval '2 minutes'/i);
});

test("M7 keeps cursors private and makes projection storage service-only", async () => {
  const sql = await readMigrations();
  assert.match(sql, /create table private\.wechat_scan_cursors/i);
  assert.match(sql, /revoke execute on function public\.store_wechat_projection[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.store_wechat_projection[\s\S]+to service_role/i);
  assert.match(sql, /on conflict \(allowlist_group_id\) do update/i);
});

test("M7 sends high-confidence projections to the candidate pool and uncertainty to inbox only", async () => {
  const sql = await readMigrations();
  assert.match(sql, /target_confidence >= 0\.900 then 'candidate' else 'pending'/i);
  assert.match(sql, /insert into public\.opportunity_candidates/i);
  assert.match(sql, /'wechat_candidate' else 'wechat_pending'/i);
  assert.match(sql, /inbox_items_exactly_one_source/i);
});

test("M7 exposes audited control RPCs without opening direct browser writes", async () => {
  const sql = await readMigrations();
  for (const signature of [
    "create_my_wechat_allowlist_group\\(text, text, text\\)",
    "set_my_wechat_allowlist_group\\(uuid, text, boolean\\)",
    "set_my_wechat_monitor_state\\(text\\)"
  ]) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${signature}[\\s\\S]+from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]+to authenticated`, "i"));
  }
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*wechat_allowlist_groups[^;]*to authenticated/i);
  assert.match(sql, /wechat\.allowlist_created/i);
  assert.match(sql, /wechat\.monitor_' \|\| target_state/i);
});

test("M7 start rechecks permissions and refuses empty allowlists", async () => {
  const sql = await readMigrations();
  assert.match(sql, /private\.evaluate_permission\(actor_user_id, 'wechat\.monitor', null\)/i);
  assert.match(sql, /where user_id = actor_user_id and enabled[\s\S]+for share/i);
  assert.match(sql, /raise exception 'wechat_allowlist_empty'/i);
  assert.match(sql, /observed_state = case[\s\S]+last_heartbeat_at >= now\(\) - interval '2 minutes'/i);
});

test("M7 pause, stop, and group disable invalidate old work atomically", async () => {
  const sql = await readMigrations();
  assert.match(sql, /stop_generation = public\.wechat_monitor_states\.stop_generation \+ 1/i);
  assert.match(sql, /if group_record\.enabled and not target_enabled then[\s\S]+stop_generation = stop_generation \+ 1/i);
  assert.match(sql, /capability_key = 'wechat\.monitor'[\s\S]+status in \('queued', 'running'\)/i);
  assert.match(sql, /status = case when status = 'queued' then 'cancelled' else 'cancel_requested' end/i);
});

test("M7 keeps privileged control implementations outside the exposed schema", async () => {
  const sql = await readMigrations();
  assert.match(sql, /alter function public\.create_my_wechat_allowlist_group\(text, text, text\)[\s\S]+set schema private/i);
  assert.match(sql, /create function public\.create_my_wechat_allowlist_group[\s\S]+security invoker/i);
  assert.match(sql, /create function public\.set_my_wechat_allowlist_group[\s\S]+security invoker/i);
  assert.match(sql, /create function public\.set_my_wechat_monitor_state[\s\S]+security invoker/i);
  assert.match(sql, /grant usage on schema private to authenticated/i);
  assert.match(sql, /grant execute on function private\.set_my_wechat_monitor_state\(text\)[\s\S]+to authenticated/i);
});

test("M7 heartbeat and assignment RPCs are service-only invoker wrappers", async () => {
  const sql = await readMigrations();
  for (const name of ["get_wechat_monitor_assignment", "report_wechat_monitor_heartbeat"]) {
    assert.match(sql, new RegExp(`create function public\\.${name}[\\s\\S]+security invoker`, "i"));
    assert.match(sql, new RegExp(`revoke execute on function public\\.${name}[\\s\\S]+?\\)\\s+from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}[\\s\\S]+?\\)\\s+to service_role`, "i"));
  }
  assert.match(sql, /create function private\.get_wechat_monitor_assignment[\s\S]+security definer/i);
  assert.match(sql, /create function private\.report_wechat_monitor_heartbeat[\s\S]+security definer/i);
});

test("M7 heartbeat fails closed on stale work, permissions, and unknown adapters", async () => {
  const sql = await readMigrations();
  assert.match(sql, /state_record\.stop_generation <> target_stop_generation[\s\S]+stale_stop_generation/i);
  assert.match(sql, /private\.evaluate_permission\(target_user_id, 'wechat\.monitor', null\)/i);
  assert.match(sql, /where user_id = target_user_id and enabled/i);
  assert.match(sql, /target_environment_summary->>'adapter_mode' is distinct from 'synthetic'/i);
  assert.match(sql, /target_observed_state not in \('healthy', 'blocked', 'error'\)/i);
  assert.match(sql, /last_heartbeat_at = now\(\)/i);
});

test("M7 visible OCR pairing and heartbeat have no WeChat send surface", async () => {
  const sql = await readMigrations();
  assert.match(sql, /create function public\.pair_wechat_visible_group[\s\S]+security invoker/i);
  assert.match(sql, /create function private\.pair_wechat_visible_group[\s\S]+security definer/i);
  assert.match(sql, /revoke execute on function public\.pair_wechat_visible_group[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.pair_wechat_visible_group[\s\S]+to service_role/i);
  assert.match(sql, /target_environment_summary->>'adapter_mode'[\s\S]+visible_ocr_v1/i);
  assert.match(sql, /interaction_mode' is distinct from 'visible_list_mouse_only'/i);
  assert.match(sql, /keyboard_input'[\s\S]+::boolean/i);
  assert.match(sql, /clipboard_access'[\s\S]+::boolean/i);
  assert.match(sql, /send_capability'[\s\S]+::boolean/i);
  assert.match(sql, /'user_active'/i);
  assert.match(sql, /create function public\.get_single_wechat_monitor_user_id\(\)[\s\S]+security invoker/i);
  assert.match(sql, /single_user_invariant_failed/i);
  assert.match(sql, /revoke execute on function public\.get_single_wechat_monitor_user_id\(\)[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_single_wechat_monitor_user_id\(\)[\s\S]+to service_role/i);
  assert.doesNotMatch(sql, /(?:send|reply|forward)_wechat_message/i);
});

test("M7 manual text and link imports are minimal, idempotent, and permission gated", async () => {
  const sql = await readMigrations();
  assert.match(sql, /private\.evaluate_permission\(actor_user_id, 'wechat\.import', null\)/i);
  assert.match(sql, /ingestion_mode in \('monitor', 'manual'\)/i);
  assert.match(sql, /source_kind in \('text', 'link'\)/i);
  assert.match(sql, /source_url ~ '\^https:\/\//i);
  assert.match(sql, /length\(normalized_excerpt\) not between 1 and 1000/i);
  assert.match(sql, /on conflict \(user_id, capture_key\) where ingestion_mode = 'manual'/i);
  assert.match(sql, /rule_version = 'wechat_manual_v1'/i);
  assert.doesNotMatch(sql, /manual[^\n]*(raw_chat|full_message|sender_profile|wechat_password)/i);
});

test("M7 manual import exposes only an authenticated invoker wrapper", async () => {
  const sql = await readMigrations();
  assert.match(sql, /create function public\.create_my_wechat_manual_import[\s\S]+security invoker/i);
  assert.match(sql, /create or replace function private\.create_my_wechat_manual_import[\s\S]+security definer/i);
  assert.match(sql, /revoke execute on function public\.create_my_wechat_manual_import[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.create_my_wechat_manual_import[\s\S]+to authenticated/i);
});

test("M7 accepting a pending WeChat inbox item promotes it to the candidate pool", async () => {
  const sql = await readMigrations();
  assert.match(sql, /alter function public\.resolve_my_inbox_item\(uuid, text\) set schema private/i);
  assert.match(sql, /projection_record\.processing_status = 'pending'[\s\S]+insert into public\.opportunity_candidates/i);
  assert.match(sql, /set processing_status = 'candidate', candidate_id = new_candidate_id/i);
  assert.match(sql, /create function public\.resolve_my_inbox_item[\s\S]+security invoker/i);
});

test("M7 screenshot intake stores metadata only after request-scoped deletion", async () => {
  const sql = await readMigrations();
  assert.match(sql, /create table public\.wechat_screenshot_intakes/i);
  assert.match(sql, /mime_type in \('image\/png', 'image\/jpeg', 'image\/webp'\)/i);
  assert.match(sql, /size_bytes between 1 and 5242880/i);
  assert.match(sql, /retention_mode[^\n]+request_scoped_delete/i);
  assert.match(sql, /processing_status[^\n]+ocr_unavailable/i);
  assert.match(sql, /private\.evaluate_permission\(target_user_id, 'wechat\.import', null\)/i);
  assert.match(sql, /private\.evaluate_permission\(target_user_id, 'files\.upload', null\)/i);
  assert.doesNotMatch(sql, /wechat_screenshot_intakes[^;]*(original_filename|storage_path|image_bytes|ocr_text)/i);
});

test("M7 screenshot metadata uses owner-only RLS and a service-only invoker", async () => {
  const sql = await readMigrations();
  assert.match(sql, /alter table public\.wechat_screenshot_intakes enable row level security/i);
  assert.match(sql, /create policy wechat_screenshot_intakes_select_own[\s\S]+auth\.uid\(\)[\s\S]+user_id/i);
  assert.match(sql, /grant select on table public\.wechat_screenshot_intakes to authenticated/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*wechat_screenshot_intakes[^;]*to authenticated/i);
  assert.match(sql, /drop function public\.record_my_wechat_screenshot_intake\(text, text, bigint\)/i);
  assert.match(sql, /create function public\.record_my_wechat_screenshot_intake\([\s\S]+target_user_id uuid[\s\S]+security invoker/i);
  assert.match(sql, /create function private\.record_my_wechat_screenshot_intake\([\s\S]+target_user_id uuid[\s\S]+security definer/i);
  assert.match(sql, /revoke execute on function public\.record_my_wechat_screenshot_intake\(uuid, text, text, bigint\)[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.record_my_wechat_screenshot_intake\(uuid, text, text, bigint\)[\s\S]+to service_role/i);
});

test("M7 file imports are request-scoped, permission gated, and always pending", async () => {
  const sql = await readMigrations();
  assert.match(sql, /source_kind in \('text', 'image', 'link', 'file'\)/i);
  assert.match(sql, /source_kind in \('text', 'link', 'file'\)/i);
  assert.match(sql, /private\.evaluate_permission\(actor_user_id, 'files\.upload', null\)/i);
  assert.match(sql, /private\.create_my_wechat_manual_import\([\s\S]+target_evidence_excerpt, false/i);
  assert.match(sql, /set source_kind = 'file', source_url = null/i);
  assert.match(sql, /'request_scoped_extraction', true/i);
  assert.match(sql, /'original_file_stored', false/i);
  assert.doesNotMatch(sql, /insert into (?:public\.)?(?:storage\.objects|wechat_file_uploads)/i);
});

test("M7 file import hardening exposes only a service-role invoker wrapper", async () => {
  const sql = await readMigrations();
  assert.match(sql, /create function private\.create_my_wechat_file_import[\s\S]+security definer/i);
  assert.match(sql, /create function public\.create_my_wechat_file_import[\s\S]+security invoker/i);
  assert.match(sql, /drop function public\.create_my_wechat_file_import[\s\S]+create function private\.create_my_wechat_file_import\([\s\S]+target_user_id uuid/i);
  assert.match(sql, /'attested_by', 'trusted_web_server'/i);
  assert.match(sql, /revoke execute on function public\.create_my_wechat_file_import\([\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.create_my_wechat_file_import\([\s\S]+to service_role/i);
});
