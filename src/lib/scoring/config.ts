// scoring/config.ts
// Why: every weight, threshold and band lives HERE and nowhere else. Calibration is a
// config edit, never a model change or a code change — that is what makes the score
// auditable and reproducible. Versioned so each judgment can record which config ran.
export const SCORING_VERSION = "scoring-v2";

export const config = {
  // Dormancy gate: below this floor the asset is "not dormant" -> PASS (stop). VRFB,
  // actively maintained, must land below the floor.
  dormancyFloor: 40,
  // Dormancy gate point values (scoring-v2). Base + hero = 75; the stale-lapse bonus and
  // residual nudges let a strongly-confirmed dormant patent reach 100. Residual upward
  // nudges only apply when the hero signal fired (see gate.ts) so they can never open
  // the gate alone — the floor invariant survives the recalibration.
  dormancyPoints: { base: 20, maintenanceLapsed: 55, staleLapse: 8, noProduct: 12, noDevelopment: 10, activeLitigation: -40 },
  // Lapse older than this (years, unreinstated) counts as "settled abandonment".
  staleLapseYears: 2,
  // Composite layer weights (must sum to 1).
  weights: { dormancy: 0.4, opportunity: 0.35, execution: 0.25 },
  // Final routing bands on the composite 0-100.
  bands: { route: 70, watch: 50 }, // >=70 ROUTE, >=50 WATCH, else PASS
  // LLM evidence band -> points, shared by opportunity/execution/buyer-fit mappers.
  bandPoints: { high: 85, medium: 55, low: 20 },
  // Execution time component: full-term-expired IP is unusable as exclusive IP; a fee
  // lapse is recoverable (revival petition) so it is penalised, not floored.
  executionTime: { active: 80, lapsed: 45, expired: 25 },
  // Shadow LLM scorer: |deterministic − shadow| within this many points ⇒ "agree".
  shadowAgreeThreshold: 15,
  // Gate 0 — transactability. An "active" patent needs at least this much term left to be
  // worth a license/acquisition route; a lapse younger than the restoration window is a
  // strong revival candidate (unintentional-delay petitions get harder as the lapse ages).
  gate0: { minTermYears: 3, restorationWindowYears: 2 },
  // Route -> transactability score. TECHNOLOGY_PACKAGE kept for forward-compat (needs
  // know-how/prototype facts we do not collect yet).
  transactability: { LICENSE_OR_ACQUIRE: 90, TECHNOLOGY_PACKAGE: 95, REVIVAL: 55, REVIVAL_STALE: 35, PUBLIC_DOMAIN_INTEL: 15, TECH_INFO: 5, UNKNOWN: 30 },
} as const;
