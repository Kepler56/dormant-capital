// prompts/shadow-score.ts
// Why: the NON-AUTHORITATIVE shadow scorer. Purely for comparison against the deterministic
// score, this focused agent reads the verified evidence and proposes its own 0–100 composite
// + verdict + rationale. It is explicitly a benchmark: it never feeds composeScore and is
// stored under a separate 'shadow' dimension. Surfacing agreement/disagreement builds trust
// and exposes calibration drift.
import { z } from "zod";

export const SHADOW_VERSION = "shadow-score-v1";

export const SHADOW_SCHEMA = z.object({
  composite: z.number().min(0).max(100),
  verdict: z.string().describe("ROUTE | WATCH | PASS"),
  rationale: z.string(),
});

export function buildShadowPrompt(a: { patentJson: string; evidenceJson: string }): string {
  return `You are an autonomous patent analyst. Based ONLY on the verified evidence, give your
own overall assessment of this patent as a dormant, acquirable asset: a composite score 0–100,
a verdict (ROUTE for strong, WATCH for promising-but-soft, PASS for not-a-fit), and a short
rationale. This is a second opinion for comparison — be decisive.

PATENT (JSON):
${a.patentJson}

VERIFIED EVIDENCE (JSON):
${a.evidenceJson}
`;
}
