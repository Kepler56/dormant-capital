// scoring/buyer-fit.ts
// Why: same pattern as opportunity/execution — the LLM extracts fit EVIDENCE (thesis
// alignment band + a blocking-mismatch flag with snippets); this deterministic mapper turns
// that evidence into the Buyer-Fit number. blocking_mismatch is a hard disqualifier (wrong
// domain, wrong geography, incompatible tech): it floors the score at bandPoints.low
// regardless of how well the thesis otherwise aligns, and the snippet naming the mismatch
// is surfaced as an explicit reason so a buyer sees exactly why fit was capped.
import { config } from "./config";
import type { BuyerFitEvidence } from "@/lib/types";

export function buyerFitScore(ev: BuyerFitEvidence): { score: number; reasons: string[] } {
  const alignment = String(ev.thesis_alignment.value).trim().toLowerCase();
  const points = config.bandPoints;
  let score: number = alignment === "high" ? points.high : alignment === "medium" ? points.medium : points.low;
  const reasons: string[] = [`Thesis alignment: ${alignment || "low"}.`];

  const mismatch = String(ev.blocking_mismatch.value).trim().toLowerCase();
  if (mismatch === "yes") {
    score = Math.min(score, points.low);
    reasons.push(`Blocking mismatch: ${ev.blocking_mismatch.snippet || "unspecified disqualifier"}`);
  }

  return { score, reasons };
}
