// Search evaluation (#20): recall@k and MRR over tests/fixtures/search-gold.json, plus the
// pre-#12 baseline (case-insensitive includes() over opportunity company/role/location/department,
// ordered by recency). Pure functions: no database access here.
import { createHash } from "node:crypto";

export function goldId(key) {
  const hex = createHash("sha256").update(`mfin-os.search-gold.v1:${key}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function recallAtK(ranked, relevant, k = 5) {
  if (relevant.length === 0) return 1;
  const top = new Set(ranked.slice(0, k));
  return relevant.filter((key) => top.has(key)).length / relevant.length;
}

export function reciprocalRank(ranked, relevant) {
  const wanted = new Set(relevant);
  const index = ranked.findIndex((key) => wanted.has(key));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function evaluate(queries, rankedByQuery, k = 5) {
  const rows = queries.map((query) => {
    const ranked = rankedByQuery[query.id] ?? [];
    return { id: query.id, lang: query.lang, query: query.query, recall: recallAtK(ranked, query.relevant, k), rr: reciprocalRank(ranked, query.relevant), top: ranked.slice(0, k) };
  });
  const mean = (list, field) => (list.length ? list.reduce((sum, row) => sum + row[field], 0) / list.length : 0);
  const byLang = Object.fromEntries(["zh", "en", "mixed"].map((lang) => {
    const subset = rows.filter((row) => row.lang === lang);
    return [lang, { n: subset.length, recallAt5: mean(subset, "recall"), mrr: mean(subset, "rr") }];
  }));
  return { n: rows.length, recallAt5: mean(rows, "recall"), mrr: mean(rows, "rr"), byLang, rows };
}

// The list filter that existed before #12 (apps/web/src/lib/workspaces/data.ts at 015020b).
export function baselineRanking(documents, query) {
  const needle = query.toLocaleLowerCase("zh-CN");
  return documents
    .filter((doc) => doc.type === "opportunity")
    .filter((doc) => [doc.company, doc.role_title, doc.location, doc.department]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase("zh-CN").includes(needle)))
    .map((doc) => doc.key);
}

const sql = (value) => (value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`);

// Insert statements for the gold corpus (run as the database owner; triggers build the index).
export function buildCorpusSql(gold, userId) {
  const lines = [];
  gold.documents.forEach((doc, index) => {
    const id = sql(goldId(doc.key));
    const user = sql(userId);
    if (doc.type === "opportunity") {
      lines.push(`insert into public.opportunities (id, user_id, track, intent, company, role_title, department, location, requirements, responsibilities, main_stage, updated_at)
        values (${id}, ${user}, ${sql(doc.track)}, 'track', ${sql(doc.company)}, ${sql(doc.role_title)}, ${sql(doc.department)}, ${sql(doc.location)}, ${sql(doc.requirements)}, ${sql(doc.responsibilities)}, 'evaluation', now() - interval '${index} minutes');`);
    } else if (doc.type === "candidate") {
      lines.push(`insert into public.opportunity_candidates (id, user_id, track, company, role_title, location, source_summary)
        values (${id}, ${user}, ${sql(doc.track)}, ${sql(doc.company)}, ${sql(doc.role_title)}, ${sql(doc.location)}, ${sql(doc.source_summary)});`);
    } else {
      lines.push(`insert into public.gmail_messages (id, user_id, provider_message_id, provider_thread_id, history_id, received_at, classification, sender_summary, subject, summary, gmail_link, needs_action, action_title, confidence)
        values (${id}, ${user}, ${sql(`gold-${doc.key}`)}, ${sql(`gold-${doc.key}`)}, '1', now() - interval '${index} hours', 'job', ${sql(doc.sender_summary)}, ${sql(doc.subject)}, ${sql(doc.summary)}, ${sql(`https://mail.google.com/mail/u/0/#inbox/gold-${doc.key}`)}, ${doc.action_title ? "true" : "false"}, ${sql(doc.action_title)}, 0.9);`);
    }
  });
  return lines.join("\n");
}

// One SELECT that runs every gold query through search_my_workspace and returns "id|uuid,uuid,...".
export function buildQuerySql(gold, k = 5) {
  const values = gold.queries.map((query) => `(${sql(query.id)}, ${sql(query.query)})`).join(",\n    ");
  return `select q.id || '|' || coalesce((select string_agg(r.object_id::text, ',' order by r.ord)
      from (select s.object_id, row_number() over () as ord from public.search_my_workspace(q.query, target_limit => ${k}) s) r), '')
    from (values ${values}) as q(id, query) order by q.id`;
}

export function parseRankings(output, gold) {
  const keyById = new Map(gold.documents.map((doc) => [goldId(doc.key), doc.key]));
  return Object.fromEntries(output.split("\n").filter((line) => line.includes("|")).map((line) => {
    const [id, ids] = line.split("|");
    return [id, ids ? ids.split(",").map((value) => keyById.get(value) ?? value) : []];
  }));
}

export function formatReport(label, result) {
  const pct = (value) => value.toFixed(3);
  const langs = Object.entries(result.byLang).map(([lang, value]) => `${lang} ${pct(value.recallAt5)}/${pct(value.mrr)} (n=${value.n})`).join(" · ");
  return `${label}: recall@5 ${pct(result.recallAt5)} · MRR ${pct(result.mrr)} — ${langs}`;
}
