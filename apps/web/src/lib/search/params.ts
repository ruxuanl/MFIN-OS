// Parse /search query-string parameters into bounded, validated RPC arguments.
export const searchObjectTypes = ["opportunity", "candidate", "gmail_message"] as const;
export type SearchObjectType = (typeof searchObjectTypes)[number];

const stages = new Set(["new", "evaluation", "preparation", "submitted", "test", "interview", "waiting", "offer", "ended",
  "candidate", "later", "job", "academic", "personal", "pending"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export type SearchParams = {
  query: string;
  types: SearchObjectType[];
  track: "internship" | "graduate" | null;
  stage: string | null;
  company: string | null;
  location: string | null;
  deadlineFrom: string | null;
  deadlineTo: string | null;
};

export function parseSearchParams(raw: Raw): SearchParams {
  const typeValues = (Array.isArray(raw.type) ? raw.type : raw.type ? [raw.type] : [])
    .filter((value): value is SearchObjectType => (searchObjectTypes as readonly string[]).includes(value));
  const track = one(raw.track);
  const stage = one(raw.stage);
  const from = one(raw.from);
  const to = one(raw.to);
  return {
    query: one(raw.q).slice(0, 200),
    types: [...new Set(typeValues)],
    track: track === "internship" || track === "graduate" ? track : null,
    stage: stages.has(stage) ? stage : null,
    company: one(raw.company).slice(0, 120) || null,
    location: one(raw.location).slice(0, 120) || null,
    deadlineFrom: datePattern.test(from) ? from : null,
    deadlineTo: datePattern.test(to) ? to : null
  };
}

export function hasCriteria(params: SearchParams) {
  return Boolean(params.query || params.types.length || params.track || params.stage || params.company
    || params.location || params.deadlineFrom || params.deadlineTo);
}

export function resultHref(item: { object_type: string; object_id: string; track: string | null }) {
  if (item.object_type === "opportunity") return `${item.track === "graduate" ? "/graduate" : "/internships"}/${item.object_id}`;
  if (item.object_type === "candidate") return item.track === "graduate" ? "/graduate" : "/internships";
  return "/inbox";
}
