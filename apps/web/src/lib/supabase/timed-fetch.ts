// Development-only request timing (MFIN_DEBUG_TIMING=1). Logs the method, the table or
// RPC name and the duration of each Supabase call; never the query string, filters,
// headers or response body, so no record contents reach the log.
export function timedFetch(baseFetch: typeof fetch = fetch, log: (line: string) => void = console.info): typeof fetch {
  return async (input, init) => {
    const started = performance.now();
    const response = await baseFetch(input, init);
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const target = new URL(href).pathname.split("/").filter(Boolean).slice(-2).join("/");
    log(`[mfin-timing] ${(init?.method ?? "GET").toUpperCase()} ${target} ${response.status} ${Math.round(performance.now() - started)}ms`);
    return response;
  };
}
