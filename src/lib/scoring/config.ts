// scoring/config.ts
// Why: every weight, threshold and band lives HERE and nowhere else. Calibration is a
// config edit, never a model change or a code change — that is what makes the score
// auditable and reproducible. Versioned so each judgment can record which config ran.
export const SCORING_VERSION = "scoring-v1";

export const config = {
  // Dormancy gate: below this floor the asset is "not dormant" -> PASS (stop). VRFB,
  // actively maintained, must land below the floor.
  dormancyFloor: 40,
  // Composite layer weights (must sum to 1).
  weights: { dormancy: 0.4, opportunity: 0.35, execution: 0.25 },
  // Final routing bands on the composite 0-100.
  bands: { route: 70, watch: 50 }, // >=70 ROUTE, >=50 WATCH, else PASS
  // Shadow LLM scorer: |deterministic − shadow| within this many points ⇒ "agree".
  shadowAgreeThreshold: 15,
} as const;
