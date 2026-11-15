import { expect, it, vi } from "vitest";
import { readAll } from "./data";
it("exhausts PostgREST pages beyond the default 1000-row limit", async () => {
  const read = vi.fn(async (from: number, to: number) => ({ data: Array.from({ length: 1001 }, (_, i) => i).slice(from, to + 1), error: null }));
  expect(await readAll(read)).toHaveLength(1001);
  expect(read).toHaveBeenCalledTimes(3);
});
it("fails the whole statistic rather than showing partial numbers", async () => {
  let page = 0;
  await expect(readAll(async () => ++page === 1 ? { data: Array(500).fill(1), error: null } : { data: null, error: new Error("synthetic unavailable") })).rejects.toThrow("dashboard_data_unavailable");
});
