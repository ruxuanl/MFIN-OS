"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BusyLabel } from "@/components/operation-feedback";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import type { MutationResult, PendingMutation, WorkspaceObjectType } from "@/lib/workspaces/model";
import { getMutationOutcomeLabel } from "@/lib/workspaces/model";
import { enqueueMutation, getDeviceId } from "@/lib/workspaces/outbox";

export type MutationField = {
  name: string;
  label: string;
  type?: "text" | "date" | "datetime-local" | "number" | "select" | "textarea";
  options?: Array<{ value: string; label: string }>;
  nullable?: boolean;
  locked?: boolean;
};

function inputValue(value: unknown, type: MutationField["type"]) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (type === "datetime-local") return text.slice(0, 16);
  return text;
}
function typedValue(value: string, field: MutationField) {
  const trimmed = value.trim();
  if (field.nullable && trimmed === "") return null;
  if (field.type === "number") return Number(trimmed);
  if (field.type === "datetime-local" && trimmed) return new Date(trimmed).toISOString();
  return trimmed;
}

export function WorkspaceMutationForm({
  objectType,
  objectId,
  version,
  initialValues,
  fields,
  submitLabel = "保存修改"
}: {
  objectType: WorkspaceObjectType;
  objectId: string;
  version: number;
  initialValues: Record<string, unknown>;
  fields: MutationField[];
  submitLabel?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const patch = Object.fromEntries(fields.map((field) => [field.name, typedValue(String(formData.get(field.name) ?? ""), field)]));
    const baseValues = Object.fromEntries(fields.map((field) => [field.name, initialValues[field.name] ?? null]));
    const mutation: PendingMutation = {
      id: crypto.randomUUID(),
      deviceId: getDeviceId(),
      objectType,
      objectId,
      baseVersion: version,
      baseValues,
      patch,
      createdAt: new Date().toISOString()
    };

    if (!navigator.onLine) {
      await enqueueMutation(mutation);
      setMessage("已保存到本机 Outbox，联网后会按顺序同步。");
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("apply_workspace_mutation", {
      target_mutation_id: mutation.id,
      target_device_id: mutation.deviceId,
      target_object_type: mutation.objectType,
      target_object_id: mutation.objectId,
      target_base_version: mutation.baseVersion,
      target_base_values: mutation.baseValues as Json,
      target_patch: mutation.patch as Json
    });

    if (error) {
      setMessage("保存失败；未覆盖云端数据，请检查字段组合后重试。");
      setSaving(false);
      return;
    }
    const result = data as unknown as MutationResult;
    setMessage(getMutationOutcomeLabel(result));
    setSaving(false);
    router.refresh();
  }

  return (
    <form className="workspace-form" onSubmit={submit}>
      <div className="field-grid">
        {fields.map((field) => (
          <label key={field.name} className={field.type === "textarea" ? "field-wide" : undefined}>
            <span>{field.label}{field.locked ? <small className="lock-chip">已锁</small> : null}</span>
            {field.type === "select" ? (
              <select name={field.name} defaultValue={inputValue(initialValues[field.name], field.type)}>
                {field.nullable ? <option value="">—</option> : null}
                {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : field.type === "textarea" ? (
              <textarea name={field.name} defaultValue={inputValue(initialValues[field.name], field.type)} rows={3} />
            ) : (
              <input
                name={field.name}
                type={field.type ?? "text"}
                defaultValue={inputValue(initialValues[field.name], field.type)}
              />
            )}
          </label>
        ))}
      </div>
      <div className="form-footer">
        <button aria-busy={saving || undefined} className="primary-button" disabled={saving}>{saving ? <BusyLabel>保存中…</BusyLabel> : submitLabel}</button>
        <small>手动修改的字段会自动加锁；AI 只能提出建议，不能覆盖。</small>
      </div>
      {message ? <p className="inline-message">{message}</p> : null}
    </form>
  );
}
