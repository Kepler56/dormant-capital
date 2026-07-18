// prompts/opportunity-execution.ts
// Why: extracts the soft signals deterministic code cannot read off the page — commercial
// relevance, how broad the claims read, and how clear ownership is. Evidence only
// (low|medium|high bands with snippet + confidence), never a 0-100 score. The model is
// told to ground each band in the supplied text and to prefer the lower band when unsure,
// so the score stays conservative rather than optimistic.
// v3: grounded. The research node fans out queries across all three dimensions — including
// opportunity and execution — but this prompt previously accepted only the patent's own
// bibliographic fields, so every one of those searches was paid for and then thrown away, and
// both bands were pure model prior. Web evidence is now passed in and the rules below tell the
// model to prefer it over its own priors.
export const PROMPT_VERSION = "opp-exec-v3";

export function buildOppExecPrompt(args: {
  title: string; abstract: string; assignee: string; cpc: string; webEvidence?: string;
}): string {
  const evidence = (args.webEvidence ?? "").trim();
  return `You are a patent opportunity & execution evidence extractor for an institutional
patent brokerage. You do NOT score — deterministic code converts your evidence into numbers.

RULES (follow exactly):
1. Return ONE JSON object matching the schema. Never an array, never code fences.
2. For each field, "value" MUST be exactly "low", "medium", or "high".
3. Ground each judgement in the WEB EVIDENCE first and the patent text second. Include a short
   snippet from whichever you used (or "" if you reasoned from structure rather than a phrase).
   Prefer the web evidence when the two disagree — it reflects the market today, the abstract
   only reflects the filing.
4. When genuinely unsure, choose the LOWER band — an institutional buyer prefers a
   conservative read over an inflated one.
5. "confidence" = how well the evidence supports the band (high/medium/low). If the web evidence
   is absent or says nothing relevant, you may still band from the patent text, but set
   "confidence" to "low" and say so in value_summary — a band reasoned without market evidence
   must not look as solid as one backed by sources.

FIELDS:
- commercial_relevance: how commercially relevant is the underlying technology in today's market?
- claim_breadth: how broad / foundational does the invention read from the abstract (narrow
  point-solution = low, broad enabling platform = high)?
- ownership_clarity: from the assignee string, how clear is it who owns this today (a single
  clean corporate assignee = high; missing, individual, or ambiguous = low)?

Also provide "value_summary": 1–2 plain sentences a non-technical buyer can read, describing
why this patent is or isn't commercially interesting. No scores, no jargon, no numbers.

PATENT
Title: ${args.title}
Assignee: ${args.assignee}
CPC: ${args.cpc || "(none)"}
Abstract: ${args.abstract || "(none provided)"}

WEB EVIDENCE
${evidence || "(no web evidence available — band from the patent text and set confidence to low)"}
`;
}
