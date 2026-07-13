// scoring/opportunity.ts
// Why: turns evidence (forward citations as a value proxy + LLM commercial-relevance /
// claim-breadth bands) into an Opportunity sub-score. Deterministic mapping, so two
// identical evidence sets always yield the same number.
import { config } from "./config";
import type { OppExecEvidence, ParsedPatent } from "@/lib/types";

const band = (v: unknown): number =>
  v === "high" ? config.bandPoints.high : v === "medium" ? config.bandPoints.medium : config.bandPoints.low;

export function opportunityScore(p: ParsedPatent, ev?: OppExecEvidence): number {
  // Forward citations: log-ish ladder so a few citations move the needle but volume
  // does not run away. 0 -> 10, 1-4 -> 35, 5-19 -> 60, 20+ -> 85.
  const fc = p.forwardCitations ?? 0;
  const citation = fc >= 20 ? 85 : fc >= 5 ? 60 : fc >= 1 ? 35 : 10;
  if (!ev) return citation;
  return Math.round(0.5 * citation + 0.3 * band(ev.commercial_relevance.value) + 0.2 * band(ev.claim_breadth.value));
}
