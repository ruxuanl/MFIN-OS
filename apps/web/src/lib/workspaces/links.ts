import type { OpportunityFilters, SavedView } from "./data";

export function viewHref(basePath: string, view: Pick<SavedView, "filters" | "sort_spec">) {
  const filters = view.filters && typeof view.filters === "object" && !Array.isArray(view.filters)
    ? view.filters as Record<string, unknown>
    : {};
  const params = new URLSearchParams({ tab: "tracked" });
  for (const key of ["query", "stage", "state"]) {
    if (typeof filters[key] === "string" && filters[key]) params.set(key, filters[key]);
  }
  if (Array.isArray(view.sort_spec) && typeof view.sort_spec[0] === "string") params.set("sort", view.sort_spec[0]);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function pageHref(basePath: string, filters: OpportunityFilters, page: number) {
  const params = new URLSearchParams({ tab: "tracked" });
  if (filters.query) params.set("query", filters.query);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.state && filters.state !== "active") params.set("state", filters.state);
  if (filters.sort && filters.sort !== "updated") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

