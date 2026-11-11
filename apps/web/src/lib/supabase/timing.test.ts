import { describe, expect, it } from "vitest";



import { timedFetch } from "./timed-fetch";

describe("timedFetch", () => {
  it("logs only method, table or RPC name, status and duration", async () => {
    const lines: string[] = [];
    const fetcher = timedFetch(async () => new Response("[]", { status: 200 }), (line) => lines.push(line));
    await fetcher("https://ref.supabase.co/rest/v1/opportunities?select=id&company=ilike.%25Secret%25", { method: "get" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[mfin-timing\] GET v1\/opportunities 200 \d+ms$/);
    expect(lines[0]).not.toContain("Secret");
    expect(lines[0]).not.toContain("select=");
  });
});
