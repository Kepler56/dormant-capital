// prompts/buyer-fit.ts
// Why: extracts how well ONE patent matches ONE buyer's standing thesis — the demand-side
// counterpart to opportunity/execution (brief Upgrade 3). Evidence only (low|medium|high
// alignment band + a yes|no|unknown blocking-mismatch flag, both with snippet + confidence),
// never a 0-100 score. Same conservative-when-unsure instruction as opp-exec: the mapper in
// scoring/buyer-fit.ts turns this evidence into the number.
export const BUYER_FIT_PROMPT_VERSION = "buyer-fit-v1";

export function buyerFitPrompt(args: {
  thesis: string;
  patent: { number: string; title: string | null; abstract: string | null; assignee: string | null; cpcClasses: string[] };
}): string {
  const { thesis, patent } = args;
  return `You are a buyer-fit evidence extractor for an institutional patent brokerage. You do
NOT score — deterministic code converts your evidence into a number.

RULES (follow exactly):
1. Return ONE JSON object matching the schema. Never an array, never code fences.
2. For "thesis_alignment", "value" MUST be exactly "low", "medium", or "high".
3. For "blocking_mismatch", "value" MUST be exactly "yes", "no", or "unknown". Answer "yes"
   ONLY for a hard disqualifier — wrong technology domain, wrong geography/jurisdiction the
   buyer cannot operate in, or fundamentally incompatible technology. A merely weak thesis
   fit is NOT a blocking mismatch; that belongs in "thesis_alignment" instead.
4. Ground each judgement in the patent text or the buyer thesis. Include a short verbatim
   snippet that justifies the value (or "" if you reasoned from structure rather than a phrase).
5. When genuinely unsure, choose the LOWER alignment band and "unknown" for blocking_mismatch
   — an institutional buyer prefers a conservative read over an inflated one.
6. "confidence" = how well the evidence supports the value (high/medium/low).

BUYER THESIS
${thesis}

PATENT
Number: ${patent.number}
Title: ${patent.title || "(none)"}
Assignee: ${patent.assignee || "(none)"}
CPC: ${patent.cpcClasses.length ? patent.cpcClasses.join(", ") : "(none)"}
Abstract: ${patent.abstract || "(none provided)"}

FIELDS:
- thesis_alignment: how well does this specific patent match the buyer's thesis above?
- blocking_mismatch: is there a hard disqualifier that rules this patent out for this buyer
  regardless of how well it otherwise aligns?

Also provide "fit_summary": 1-2 plain sentences a non-technical buyer can read, explaining
why this patent does or doesn't fit their thesis. No scores, no jargon, no numbers.
`;
}
