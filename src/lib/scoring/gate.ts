// scoring/gate.ts
// Why: dormancy is a GATE computed data-first. The maintenance-fee lapse is decisive;
// the LLM residual (product still on the market? active development? litigation?) only
// nudges. Returning a 0-100 plus a pass/stop decision keeps the gate explainable line
// by line — the opposite of asking a model "how dormant is this, 0-100?".
import { config } from "./config";
import { yearsSinceLapse } from "./signals";
import type { DormancyResidual, ParsedPatent } from "@/lib/types";

export type GateResult = { dormancyScore: number; passedGate: boolean; reasons: string[] };

export function dormancyGate(p: ParsedPatent, residual?: DormancyResidual, now: Date = new Date()): GateResult {
  // Baseline sits BELOW the floor on purpose: a patent is presumed NOT dormant until a
  // hard, observable signal proves abandonment. This is the data-first defense against
  // the VRFB false positive — an actively-maintained patent stays a PASS no matter what
  // the LLM guesses, because only the maintenance-fee lapse (the hero signal) can clear
  // the floor. The LLM residual may refine the number but cannot, alone, open the gate.
  const pts = config.dormancyPoints;
  let score: number = pts.base;
  const reasons: string[] = [];

  // THE HERO SIGNAL. Owner stopped paying renewals ⇒ literally abandoned ⇒ this alone
  // clears the floor (20 + 55 = 75). It is the only thing that can pass the gate.
  if (p.maintenanceLapsed) {
    score += pts.maintenanceLapsed;
    reasons.push("Maintenance fee lapsed (owner abandonment) — hero signal.");

    // Stale-lapse bonus: a lapse that has sat unreinstated for years is settled
    // abandonment, not a temporary lapse the owner might still cure.
    const stale = yearsSinceLapse(p, now);
    if (stale !== null && stale >= config.staleLapseYears) {
      score += pts.staleLapse;
      reasons.push(`Lapse is ${stale.toFixed(1)} years old with no reinstatement — abandonment is settled.`);
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
      if (isNo(residual.product_exists.value)) { score += pts.noProduct; reasons.push("LLM: no current product found."); }
      if (isNo(residual.active_development.value)) { score += pts.noDevelopment; reasons.push("LLM: no active development found."); }
    }
    if (isYes(residual.active_litigation.value)) { score += pts.activeLitigation; reasons.push("LLM: active litigation — decisively NOT dormant."); }
  }

  score = Math.max(0, Math.min(100, score));
  const passedGate = score >= config.dormancyFloor; // pass gate = proceed to score
  return { dormancyScore: score, passedGate, reasons };
}
