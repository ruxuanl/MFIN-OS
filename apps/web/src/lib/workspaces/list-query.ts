// PostgREST `or` filters use commas and parentheses as syntax; strip them, and the
// LIKE wildcards, from user input before building an ilike pattern.
export function toIlikePattern(query: string | undefined) {
  const cleaned = (query ?? "").replace(/[,()%*_\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned ? `%${cleaned}%` : null;
}
