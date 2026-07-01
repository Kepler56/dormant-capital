// scoring/compose.ts
// Why: the one function that assembles the gated, three-layer Dormant Score. It runs
// the gate FIRST and short-circuits to PASS when an asset is not dormant — so we never
// "spend" Opportunity/Execution meaning on a live patent (the VRFB guarantee). When the
// gate passes, composite = 0.40·D + 0.35·O + 0.25·E and bands are read from config.
import { config, SCORING_VERSION } from "./config";
import { dormancyGate } from "./gate";
import { opportunityScore } from "./opportunity";
import { executionScore } from "./execution";
import type { DormancyResidual, OppExecEvidence, ParsedPatent } from "@/lib/types";

export type ScoreResult = {
  version: string;
  dormancy: number; opportunity: number | null; execution: number | null;
  composite: number | null; passedGate: boolean;
  band: "ROUTE" | "WATCH" | "PASS"; reasons: string[];
};

export function composeScore(
  p: ParsedPatent, residual?: DormancyResidual, oppExec?: OppExecEvidence
): ScoreResult {
  const gate = dormancyGate(p, residual);
  if (!gate.passedGate) {
    // Not dormant -> stop. PASS here means "passed over", per the brief.
    return { version: SCORING_VERSION, dormancy: gate.dormancyScore, opportunity: null,
      execution: null, composite: null, passedGate: false, band: "PASS", reasons: gate.reasons };
  }
  const o = opportunityScore(p, oppExec);
  const e = executionScore(p, oppExec);
  const composite = Math.round(
    config.weights.dormancy * gate.dormancyScore +
    config.weights.opportunity * o +
    config.weights.execution * e
  );
  const band = composite >= config.bands.route ? "ROUTE" : composite >= config.bands.watch ? "WATCH" : "PASS";
  return { version: SCORING_VERSION, dormancy: gate.dormancyScore, opportunity: o,
    execution: e, composite, passedGate: true, band, reasons: gate.reasons };
}
