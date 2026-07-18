// scoring/compose.ts
// Why: the one function that assembles the gated, three-layer Dormant Score. It runs
// the gate FIRST and short-circuits to PASS when an asset is not dormant — so we never
// "spend" Opportunity/Execution meaning on a live patent (the VRFB guarantee). When the
// gate passes, composite = 0.40·D + 0.35·O + 0.25·E and bands are read from config.
import { config, SCORING_VERSION } from "./config";
import { dormancyGate } from "./gate";
import type { ScoreTerm } from "./gate";
import { opportunityScore } from "./opportunity";
import { executionScore } from "./execution";
import { runGate0 } from "./gate0";
import type { Gate0Result, RouteType } from "./gate0";
import type { DormancyResidual, OppExecEvidence, ParsedPatent } from "@/lib/types";

// Why `stopReason` exists: `passedGate: false` is reached by TWO different routes — Gate 0 says
// the asset isn't transactable at all, or it is transactable but not dormant. They are opposite
// findings, and a consumer that can only see the boolean has to guess. The UI guessed wrong,
// rendering "not dormant (dormancy 83 < floor 40)" for a Gate 0 exit whose dormancy was 83.
// Naming the cause here removes the guess.
export type StopReason = "not_transactable" | "not_dormant";

export type ScoreResult = {
  version: string;
  gate0: Gate0Result; transactability: number; route: RouteType;
  dormancy: number; opportunity: number | null; execution: number | null;
  composite: number | null; passedGate: boolean;
  band: "ROUTE" | "WATCH" | "PASS"; reasons: string[];
  /** Why scoring stopped, or null when it ran to completion. */
  stopReason: StopReason | null;
  /** The dormancy arithmetic, term by term — what makes the score explainable rather than asserted. */
  dormancyTerms: ScoreTerm[];
};

export function composeScore(
  p: ParsedPatent, residual?: DormancyResidual, oppExec?: OppExecEvidence, now?: Date
): ScoreResult {
  // Gate 0 runs FIRST: is this asset even legally transactable? A non-transactable asset
  // (full-term expiry, an ungranted application) exits here with a useful route — public-domain
  // intel is a product, not a dead end — before any dormancy/opportunity/execution meaning
  // is spent on exclusivity that does not exist.
  const g0 = runGate0(p, now);
  const gate = dormancyGate(p, residual, now);
  const common = {
    version: SCORING_VERSION, gate0: g0, transactability: g0.transactabilityScore, route: g0.route,
    dormancyTerms: gate.terms,
  };
  if (g0.transactable === "no") {
    // Non-transactable: exit with a useful route. Dormancy is still reported for context,
    // but no Opportunity/Execution tokens or meaning are spent on it.
    return { ...common, dormancy: gate.dormancyScore, opportunity: null, execution: null,
      composite: null, passedGate: false, band: "PASS", stopReason: "not_transactable",
      reasons: [...g0.reasons, ...gate.reasons] };
  }
  if (!gate.passedGate) {
    // Transactable, but not dormant -> stop. PASS here means "passed over", per the brief.
    return { ...common, dormancy: gate.dormancyScore, opportunity: null,
      execution: null, composite: null, passedGate: false, band: "PASS", stopReason: "not_dormant",
      reasons: [...g0.reasons, ...gate.reasons] };
  }
  const o = opportunityScore(p, oppExec);
  const e = executionScore(p, oppExec);
  const composite = Math.round(
    config.weights.dormancy * gate.dormancyScore +
    config.weights.opportunity * o +
    config.weights.execution * e
  );
  const band = composite >= config.bands.route ? "ROUTE" : composite >= config.bands.watch ? "WATCH" : "PASS";
  return { ...common, dormancy: gate.dormancyScore, opportunity: o,
    execution: e, composite, passedGate: true, band, stopReason: null,
    reasons: [...g0.reasons, ...gate.reasons] };
}
