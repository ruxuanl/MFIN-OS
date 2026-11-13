// Only allow known codes into UI state and logs, never provider response bodies.
export function calendarFailureNotice(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "calendar_oauth_invalid_grant" || message === "calendar_provider_authError") return "reauthorization_required";
  if (message === "calendar_oauth_invalid_client") return "oauth_client_invalid";
  if (message === "calendar_oauth_scope_missing") return "oauth_scope_missing";
  if (message === "calendar_oauth_scope_expanded") return "oauth_scope_expanded";
  if (message === "calendar_provider_accessNotConfigured" || message === "calendar_provider_SERVICE_DISABLED") return "calendar_api_disabled";
  if (message === "calendar_privacy_locked" || message === "calendar_permission_privacy_locked") return "privacy_locked";
  if (message === "calendar_connection_paused") return "paused";
  return "sync_failed";
}

export function calendarFailureCode(error: unknown) {
  return `calendar_${calendarFailureNotice(error)}`;
}
