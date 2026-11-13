const safeGmailCodePattern = /^gmail_[a-z0-9_:.-]{1,96}$/;

export function safeGmailErrorCode(error: unknown) {
  const candidate = error instanceof Error ? error.message : "";
  return safeGmailCodePattern.test(candidate) ? candidate : "gmail_sync_failed";
}

export function displayableGmailErrorCode(value: string | null | undefined) {
  return value && safeGmailCodePattern.test(value) ? value : null;
}

export function gmailOAuthFailureNotice(error: unknown) {
  const code = safeGmailErrorCode(error);
  if (code === "gmail_oauth_invalid_client") return "oauth_client_invalid";
  if (code === "gmail_oauth_invalid_grant") return "oauth_code_expired";
  if (code === "gmail_oauth_scope_expanded" || code === "gmail_scope_not_readonly") return "oauth_scope_invalid";
  if (code === "gmail_oauth_incomplete_credentials") return "oauth_credentials_incomplete";
  return "connection_failed";
}
