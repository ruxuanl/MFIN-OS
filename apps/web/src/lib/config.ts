export type AuthMode = "mock" | "supabase" | "unconfigured";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getAuthMode(): AuthMode {
  if (process.env.AUTH_MODE === "mock" && process.env.NODE_ENV !== "production") {
    return "mock";
  }
  return isSupabaseConfigured() ? "supabase" : "unconfigured";
}

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase environment is not configured.");
  }

  return { url, publishableKey };
}

export function isCalendarServerConfigured() {
  return Boolean(
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) &&
      process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );
}

export function getSupabaseServiceConfig() {
  const { url } = getSupabasePublicConfig();
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serverKey) throw new Error("Supabase server secret is not configured for server-only Calendar work.");
  return { url, serverKey };
}

export function getCalendarOAuthConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Calendar OAuth is not configured in the server environment.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function isGmailServerConfigured() {
  return Boolean(
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) &&
      (process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID) &&
      (process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRET) &&
      (process.env.GOOGLE_GMAIL_REDIRECT_URI || process.env.GOOGLE_CALENDAR_REDIRECT_URI)
  );
}

export function getGmailOAuthConfig() {
  // A Google OAuth Web Client identifies this deployment across Workspace APIs.
  // Gmail still requests an independent exact scope and stores its own token.
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI || process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Gmail OAuth is not configured in the server environment.");
  }
  return { clientId, clientSecret, redirectUri };
}

function positiveNumber(name: string) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be configured as a positive number.`);
  }
  return value;
}

export function isOpenAiConfigured() {
  return Boolean(
    process.env.OPENAI_API_KEY
      && process.env.OPENAI_ANALYSIS_MODEL
      && process.env.OPENAI_INPUT_USD_PER_MILLION
      && process.env.OPENAI_OUTPUT_USD_PER_MILLION
      && process.env.OPENAI_USD_HKD_RATE
      && process.env.OPENAI_REQUEST_RESERVE_HKD_CENTS
  );
}

export function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_ANALYSIS_MODEL;
  if (!apiKey || !model) throw new Error("OpenAI analysis is not configured.");
  const reserveHkdCents = positiveNumber("OPENAI_REQUEST_RESERVE_HKD_CENTS");
  if (!Number.isInteger(reserveHkdCents) || reserveHkdCents > 10_000) {
    throw new Error("OPENAI_REQUEST_RESERVE_HKD_CENTS must be an integer between 1 and 10000.");
  }
  return {
    apiKey,
    model,
    inputUsdPerMillion: positiveNumber("OPENAI_INPUT_USD_PER_MILLION"),
    outputUsdPerMillion: positiveNumber("OPENAI_OUTPUT_USD_PER_MILLION"),
    usdHkdRate: positiveNumber("OPENAI_USD_HKD_RATE"),
    reserveHkdCents,
    maxOutputTokens: 2_500
  };
}

// Staged workspace remains off until its schema and upload flow are accepted.
export function isResumeWorkspaceEnabled() {
  return process.env.RESUME_WORKSPACE_ENABLED === "true";
}
