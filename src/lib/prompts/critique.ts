// prompts/critique.ts
// Why: the self-critique step is what makes the workflow credibly agentic — the model
// inspects the evidence IT gathered for weaknesses (low confidence, unanswered dimensions,
// thin sourcing) and decides whether a targeted re-search would help. It emits gaps + new
// queries, never a score.
import { z } from "zod";

export const CRITIQUE_VERSION = "critique-v1";

export const CRITIQUE_SCHEMA = z.object({
  gaps: z.array(z.string()),
  fillable: z.boolean().describe("true if another targeted search could plausibly close a gap"),
  queries: z.array(z.string()).describe("targeted follow-up search queries, empty if none"),
});

export function buildCritiquePrompt(a: { evidenceJson: string; sources: string }): string {
  return `You gathered the following evidence about a patent. Critique it HONESTLY for weaknesses:
missing dimensions, low-confidence or unsupported claims, thin or irrelevant sources.
List concrete gaps. If a targeted follow-up web search could close a gap, set fillable=true and
propose specific queries; otherwise fillable=false and queries=[].

EVIDENCE (JSON):
${a.evidenceJson}

SOURCES:
${a.sources || "(none)"}
`;
}
