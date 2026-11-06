const safeGmailCodePattern = /^gmail_[a-z0-9_:.-]{1,96}$/;

export function safeGmailErrorCode(error: unknown) {
  const candidate = error instanceof Error ? error.message : "";
  return safeGmailCodePattern.test(candidate) ? candidate : "gmail_sync_failed";
}

export function displayableGmailErrorCode(value: string | null | undefined) {
  return value && safeGmailCodePattern.test(value) ? value : null;
}
