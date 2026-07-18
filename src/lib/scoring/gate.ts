// scoring/gate.ts
// Why: dormancy is a GATE computed data-first. The maintenance-fee lapse is decisive;
// the LLM residual (product still on the market? active development? litigation?) only
// nudges. Returning a 0-100 plus a pass/stop decision keeps the gate explainable line
// by line — the opposite of asking a model "how dormant is this, 0-100?".
import { config } from "./config";
import { yearsSinceLapse } from "./signals";
import type { DormancyResidual, ParsedPatent } from "@/lib/types";

// One line of the dormancy arithmetic. `reasons` (prose) was never enough to explain the score:
// it says WHAT fired but not what it was WORTH, so a reader could not reconstruct 20+55+8=83 and
// the number looked arbitrary — or worse, looked broken when it landed on 83 yet again. Every
// term that touches the score emits one of these, so the UI can show the sum instead of a total.
export type ScoreTerm = {
  /** Stable id for linking a term to the fact/judgment that triggered it. */
  key: "base" | "maintenanceLapsed" | "staleLapse" | "noProduct" | "noDevelopment" | "activeLitigation";
  /** Short user-facing name, e.g. "Maintenance fees lapsed". */
  label: string;
  /** Signed point contribution. */
  points: number;
  /** Where this term came from — lets the UI mark LLM-derived terms as softer than record facts. */
  origin: "baseline" | "uspto_record" | "llm";
  /** One plain sentence explaining why it fired. */
  detail: string;
};

export type GateResult = {
  dormancyScore: number;
  passedGate: boolean;
  reasons: string[];
  /** Ordered arithmetic behind dormancyScore; sums (before clamping) to the raw score. */
  terms: ScoreTerm[];
  /** True when the 0-100 clamp actually changed the sum, so the UI never shows a sum that doesn't add up. */
  clamped: boolean;
};

export function dormancyGate(p: ParsedPatent, residual?: DormancyResidual, now: Date = new Date()): GateResult {
  // Baseline sits BELOW the floor on purpose: a patent is presumed NOT dormant until a
  // hard, observable signal proves abandonment. This is the data-first defense against
  // the VRFB false positive — an actively-maintained patent stays a PASS no matter what
  // the LLM guesses, because only the maintenance-fee lapse (the hero signal) can clear
  // the floor. The LLM residual may refine the number but cannot, alone, open the gate.
  const pts = config.dormancyPoints;
  let score: number = pts.base;
  const reasons: string[] = [];
  const terms: ScoreTerm[] = [{
    key: "base", label: "Baseline", points: pts.base, origin: "baseline",
    detail: `Every patent starts at ${pts.base}, below the dormancy floor of ${config.dormancyFloor} — a patent is presumed active until evidence of abandonment appears.`,
  }];

  // THE HERO SIGNAL. Owner stopped paying renewals ⇒ literally abandoned ⇒ this alone
  // clears the floor (20 + 55 = 75). It is the only thing that can pass the gate.
  if (p.maintenanceLapsed) {
    score += pts.maintenanceLapsed;
    reasons.push("Maintenance fee lapsed (owner abandonment) — hero signal.");
    terms.push({
      key: "maintenanceLapsed", label: "Maintenance fees lapsed", points: pts.maintenanceLapsed, origin: "uspto_record",
      detail: "The owner stopped paying USPTO renewal fees. This is the decisive signal — it is the only term that can lift a patent over the dormancy floor on its own.",
    });

    // Stale-lapse bonus: a lapse that has sat unreinstated for years is settled
    // abandonment, not a temporary lapse the owner might still cure.
    const stale = yearsSinceLapse(p, now);
    if (stale !== null && stale >= config.staleLapseYears) {
      score += pts.staleLapse;
      reasons.push(`Lapse is ${stale.toFixed(1)} years old with no reinstatement — abandonment is settled.`);
      terms.push({
        key: "staleLapse", label: "Lapse is settled", points: pts.staleLapse, origin: "uspto_record",
        detail: `The lapse is ${stale.toFixed(1)} years old (threshold ${config.staleLapseYears}) with no reinstatement, so abandonment looks permanent rather than a fee the owner might still cure.`,
      });
    }
  }
  // Full-term expiry is a separate disposition (public domain), not owner-dormancy, so it
  // is recorded for context but does NOT push the patent toward the dormant band.
  if (p.anticipatedExpiration) { reasons.push("Reached full term (public domain) — not owner-abandonment."); }

  // LLM residual: small, bounded nudges. Their combined upward effect (12+10=22) now
  // EXCEEDS the floor margin (40-20=20), so the upward nudges are gated on the hero
  // signal having already fired — residuals refine a confirmed hit, they never
  // manufacture dormancy on their own. Active litigation still slashes the score
  // decisively, unconditionally. Values arrive as strings ("yes"/"no"/"unknown") from
  // Gemini's schema; raw booleans are tolerated too so the gate is robust to either
  // representation.
  if (residual) {
    const norm = (v: unknown) => String(v).trim().toLowerCase();
    const isNo = (v: unknown) => v === false || ["no", "none", "false"].includes(norm(v));
    const isYes = (v: unknown) => v === true || ["yes", "true"].includes(norm(v));
    if (p.maintenanceLapsed) {
      if (isNo(residual.product_exists.value)) {
        score += pts.noProduct;
        reasons.push("LLM: no current product found.");
        terms.push({
          key: "noProduct", label: "No current product found", points: pts.noProduct, origin: "llm",
          detail: "Web research found no product on the market that practices this invention.",
        });
      }
      if (isNo(residual.active_development.value)) {
        score += pts.noDevelopment;
        reasons.push("LLM: no active development found.");
        terms.push({
          key: "noDevelopment", label: "No active development found", points: pts.noDevelopment, origin: "llm",
          detail: "Web research found no sign the owner is still developing this technology.",
        });
      }
    }
    if (isYes(residual.active_litigation.value)) {
      score += pts.activeLitigation;
      reasons.push("LLM: active litigation — decisively NOT dormant.");
      terms.push({
        key: "activeLitigation", label: "Active litigation", points: pts.activeLitigation, origin: "llm",
        detail: "The patent is being actively enforced, which is the opposite of dormant — this alone can pull the score below the floor.",
      });
    }
  }

  const raw = score;
  score = Math.max(0, Math.min(100, score));
  const passedGate = score >= config.dormancyFloor; // pass gate = proceed to score
  return { dormancyScore: score, passedGate, reasons, terms, clamped: raw !== score };
}
