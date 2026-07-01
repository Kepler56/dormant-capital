// prompts/verify.ts
// Why: the accuracy backbone. Before scoring, each material claim is checked against the
// source it cites — "does this text actually support the claim?". Unsupported claims are
// dropped/downgraded upstream, so the deterministic score is computed only over verified
// evidence. The model returns a boolean + a short note, never a score.
import { z } from "zod";

export const VERIFY_VERSION = "verify-v1";

export const VERIFY_SCHEMA = z.object({
  supported: z.boolean(),
  note: z.string(),
});

export function buildVerifyPrompt(a: { claim: string; sources: string }): string {
  return `Decide whether the SOURCES below genuinely support the CLAIM. Be strict: marketing
fluff, name collisions, or tangential mentions do NOT count as support. Answer supported=false
if the sources are silent or only weakly related.

CLAIM: ${a.claim}

SOURCES:
${a.sources || "(none)"}
`;
}
