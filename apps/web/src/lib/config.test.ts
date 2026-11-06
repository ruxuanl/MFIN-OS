import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabaseServiceConfig, isCalendarServerConfigured } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
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
