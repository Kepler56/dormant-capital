// prompts/research-plan.ts
// Why: the agent's FIRST act — turn a patent into a concrete research plan (what to find,
// which query to run) across the three scoring dimensions. It plans questions, it does not
// answer them; answering is later, grounded nodes. Keeping the plan structured lets the
// research node fan out deterministically.
import { z } from "zod";

export const PLAN_VERSION = "research-plan-v1";

export const PLAN_SCHEMA = z.object({
  items: z.array(z.object({
    dimension: z.enum(["dormancy", "opportunity", "execution"]),
    question: z.string(),
    query: z.string().describe("a concrete web search query"),
  })).min(1).max(6),
});

export function buildPlanPrompt(p: {
  title: string | null; abstract: string | null; assignee: string | null; cpcClasses?: string[];
}): string {
  return `You are planning research to evaluate whether a patent is a dormant, acquirable asset.
Produce 3–6 research items, each a specific QUESTION plus a concrete web SEARCH QUERY, spread
across three dimensions:
- dormancy: is the invention still alive (product on market, active development, litigation)?
- opportunity: how commercially relevant / broad is the technology?
- execution: how cleanly could a buyer acquire it (clear owner, encumbrances)?

Return ONE object with an "items" array. Do NOT answer the questions here — only plan them.

PATENT
Title: ${p.title ?? "(unknown)"}
Assignee: ${p.assignee ?? "(unknown)"}
CPC: ${(p.cpcClasses ?? []).join(", ") || "(none)"}
Abstract: ${p.abstract ?? "(none)"}
`;
}
