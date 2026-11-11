export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SCOPES = [GMAIL_READONLY_SCOPE] as const;
export const GMAIL_INITIAL_QUERY = "in:inbox newer_than:30d";
export const GMAIL_INITIAL_LIMIT = 50;
export const GMAIL_BODY_LIMIT = 32_000;
export const GMAIL_ATTACHMENT_LIMIT = 10 * 1024 * 1024;
export const GMAIL_ATTACHMENT_BUCKET = "gmail-attachments";
export const GMAIL_RULE_VERSION = "mail_rules_v1";
