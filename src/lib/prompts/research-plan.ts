// prompts/research-plan.ts
// Why: the agent's FIRST act — turn a patent into a concrete research plan (what to find,
// which query to run) across the three scoring dimensions. It plans questions, it does not
// answer them; answering is later, grounded nodes. Keeping the plan structured lets the
// research node fan out deterministically.
import { z } from "zod";

// v2: natural-language query style + item cap aligned to the runtime search budget.
export const PLAN_VERSION = "research-plan-v2";

export const PLAN_SCHEMA = z.object({
  items: z.array(z.object({
    dimension: z.enum(["dormancy", "opportunity", "execution"]),
    question: z.string(),
    query: z.string().describe("a concrete web search query, in plain natural language"),
  }))
    // Capped at MAX_WEB_SEARCHES (lib/agent/state.ts). The schema used to allow 6 while the
    // research node only ever ran the first 4, so two planned queries were silently discarded on
    // every run — the plan promised coverage the search never attempted.
    .min(1).max(4),
});

export function buildPlanPrompt(p: {
  title: string | null; abstract: string | null; assignee: string | null; cpcClasses?: string[];
}): string {
  return `You are planning research to evaluate whether a patent is a dormant, acquirable asset.
Produce 3–4 research items, each a specific QUESTION plus a concrete web SEARCH QUERY, spread
across three dimensions:
- dormancy: is the invention still alive (product on market, active development, litigation)?
- opportunity: how commercially relevant / broad is the technology?
- execution: how cleanly could a buyer acquire it (clear owner, encumbrances)?

QUERY STYLE — this matters, follow it exactly:
Your queries are run against an AI web-search tool that reads them as natural language. It is
NOT a keyword search engine, and search-engine syntax actively HURTS it.
- Write each query as a short, plain-language phrase a person would type or say.
- Do NOT use boolean operators (OR, AND), quotation marks, parentheses, or field prefixes.
- Do NOT put raw classification codes (e.g. G06F1/185) in a query — they return nothing. Describe
  the technology in words instead.
- Prefer concrete, nameable things: the company name, the product category, the technology in
  ordinary terms.
GOOD: Hongfujin Precision Industry electronic device shell product
GOOD: who owns the patents of Acme Robotics after the 2019 acquisition
BAD:  "G06F1/185" OR "G06F1/20" "electronic device shell" market size OR growth

Return ONE object with an "items" array. Do NOT answer the questions here — only plan them.

PATENT
Title: ${p.title ?? "(unknown)"}
Assignee: ${p.assignee ?? "(unknown)"}
CPC: ${(p.cpcClasses ?? []).join(", ") || "(none)"}
Abstract: ${p.abstract ?? "(none)"}
`;
}
