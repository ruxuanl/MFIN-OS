import "server-only";
import { radarQuery, toRadarItems, type RadarPreferences } from "./radar-model";

export async function searchInternships(preferences: RadarPreferences, fetcher: typeof fetch = fetch) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("search_not_configured");
  let response: Response;
  try {
    response = await fetcher("https://api.tavily.com/search", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: radarQuery(preferences), search_depth: "basic", topic: "general",
        max_results: 8, include_raw_content: "text", include_answer: false, auto_parameters: false })
    });
  } catch { throw new Error("search_unavailable"); }
  if (!response.ok) throw new Error(response.status === 401 ? "search_key_invalid" : response.status === 429 || response.status === 432 ? "search_limit" : "search_unavailable");
  // Bound response memory even if an upstream sends unexpectedly large page bodies.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("search_invalid_response");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 2_000_000) { await reader.cancel(); throw new Error("search_invalid_response"); }
    chunks.push(value);
  }
  try { return toRadarItems(JSON.parse(Buffer.concat(chunks).toString("utf8")).results); }
  catch { throw new Error("search_invalid_response"); }
}
