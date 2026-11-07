import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adapter = await readFile(new URL("../apps/web/src/lib/ai/openai-analysis.ts", import.meta.url), "utf8");
const actions = await readFile(new URL("../apps/web/src/app/(app)/materials/actions.ts", import.meta.url), "utf8");
const autoAnalyze = await readFile(new URL("../apps/web/src/components/auto-analyze-opportunity.tsx", import.meta.url), "utf8");
const autoAnalyzeResume = await readFile(new URL("../apps/web/src/components/auto-analyze-resume.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../apps/web/src/components/opportunity-ai-panel.tsx", import.meta.url), "utf8");
const config = await readFile(new URL("../apps/web/src/lib/config.ts", import.meta.url), "utf8");

test("OpenAI requests are server-only, bounded, structured, and not retained", () => {
  assert.match(adapter, /import "server-only"/i);
  assert.match(adapter, /store:\s*false/i);
  assert.match(adapter, /max_output_tokens:\s*config\.maxOutputTokens/i);
  assert.match(adapter, /type:\s*"json_schema"/i);
  assert.match(config, /process\.env\.OPENAI_API_KEY/i);
  assert.doesNotMatch(config, /NEXT_PUBLIC_OPENAI/i);
});

test("AI calls reserve budget first and expose no send or submission action", () => {
  assert.match(actions, /reserve_my_ai_usage/i);
  assert.match(actions, /complete_my_ai_analysis/i);
  assert.match(actions, /ai_cost_reservation_too_small/i);
  assert.doesNotMatch(`${adapter}\n${actions}`, /gmail\.send|emails\.send|send_message|submit_application|apply_job/i);
});

test("a pasted JD opens the decision panel and starts one cached analysis path", () => {
  assert.match(panel, /notice === "jd_imported" \|\| notice === "jd_duplicate"/i);
  assert.match(autoAnalyze, /started\.current/i);
  assert.match(autoAnalyze, /requestSubmit\(\)/i);
  assert.match(autoAnalyze, /analyzeOpportunityJd/i);
});

test("a newly uploaded resume can start one automatic scoring path", () => {
  assert.match(autoAnalyzeResume, /started\.current/i);
  assert.match(autoAnalyzeResume, /requestSubmit\(\)/i);
  assert.match(autoAnalyzeResume, /analyzeResumeVersion/i);
  assert.match(actions, /notice=resume_uploaded&version=/i);
});
