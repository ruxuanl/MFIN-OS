import { afterEach, describe, expect, it, vi } from "vitest";

import { getAiCacheScope, getOpenAiConfig, getSupabaseServiceConfig, isCalendarServerConfigured, isOpenAiConfigured } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubDeepSeek() {
  vi.stubEnv("AI_PROVIDER", "deepseek");
  vi.stubEnv("DEEPSEEK_API_KEY", "synthetic-deepseek-key");
  vi.stubEnv("DEEPSEEK_ANALYSIS_MODEL", "deepseek-flash");
  vi.stubEnv("DEEPSEEK_INPUT_USD_PER_MILLION", "0.3");
  vi.stubEnv("DEEPSEEK_OUTPUT_USD_PER_MILLION", "1.2");
  vi.stubEnv("DEEPSEEK_USD_HKD_RATE", "8");
  vi.stubEnv("DEEPSEEK_REQUEST_RESERVE_HKD_CENTS", "200");
}

describe("AI provider isolation and budget configuration", () => {
  it("uses only the selected provider key and official host", () => {
    stubDeepSeek();
    vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-key");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://untrusted.invalid");
    const config = getOpenAiConfig();
    expect(config.apiKey).toBe("synthetic-deepseek-key");
    expect(config.baseURL).toBe("https://api.deepseek.com");
    expect(isOpenAiConfigured()).toBe(true);
  });

  it("never substitutes an OpenAI key for a missing DeepSeek key", () => {
    stubDeepSeek();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-key");
    expect(isOpenAiConfigured()).toBe(false);
    expect(() => getOpenAiConfig()).toThrow("not configured");
  });

  it("rejects missing, negative or invalid budget parameters before enabling AI", () => {
    stubDeepSeek();
    vi.stubEnv("DEEPSEEK_INPUT_USD_PER_MILLION", "-1");
    expect(isOpenAiConfigured()).toBe(false);
    vi.stubEnv("DEEPSEEK_INPUT_USD_PER_MILLION", "0.3");
    vi.stubEnv("DEEPSEEK_REQUEST_RESERVE_HKD_CENTS", "10001");
    expect(isOpenAiConfigured()).toBe(false);
    vi.stubEnv("DEEPSEEK_REQUEST_RESERVE_HKD_CENTS", "1.5");
    expect(isOpenAiConfigured()).toBe(false);
  });

  it("does not accept unknown providers or stale DeepSeek model names", () => {
    stubDeepSeek();
    vi.stubEnv("AI_PROVIDER", "unknown");
    expect(isOpenAiConfigured()).toBe(false);
    vi.stubEnv("AI_PROVIDER", "deepseek");
    vi.stubEnv("DEEPSEEK_ANALYSIS_MODEL", "deepseek-chat");
    expect(isOpenAiConfigured()).toBe(false);
  });

  it("separates analysis caches when the model changes", () => {
    stubDeepSeek();
    const first = getAiCacheScope();
    vi.stubEnv("DEEPSEEK_ANALYSIS_MODEL", "deepseek-v4-pro");
    expect(getAiCacheScope()).not.toBe(first);
    expect(first).toContain("deepseek:deepseek-flash:");
  });
});

function stubCalendarEnvironment() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "calendar-client-id");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "calendar-client-secret");
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "http://localhost:3000/api/calendar/oauth/callback");
}

describe("Calendar server configuration", () => {
  it("prefers a separately rotatable Supabase secret key", () => {
    stubCalendarEnvironment();
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_preferred");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role-key");

    expect(isCalendarServerConfigured()).toBe(true);
    expect(getSupabaseServiceConfig()).toEqual({
      url: "https://project.example",
      serverKey: "sb_secret_preferred"
    });
  });

  it("keeps the legacy service-role variable as a compatibility fallback", () => {
    stubCalendarEnvironment();
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role-key");

    expect(isCalendarServerConfigured()).toBe(true);
    expect(getSupabaseServiceConfig().serverKey).toBe("legacy-service-role-key");
  });
});
