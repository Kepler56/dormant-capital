// lib/outcomes/types.ts
// Why: the closed vocabulary for the micro-outcome ledger (brief v2, Upgrades 2 & 5).
// Keeping events/reasons as const string unions — not free text — is what makes the
// ledger queryable (funnel counts, loss-reason breakdowns) instead of just a diary.
export const OUTCOME_EVENTS = [
  "owner_identified", "owner_reachable", "owner_willing",
  "price_captured", "legal_verification_passed",
  "buyer_interest", "nda_signed", "diligence_started",
  "offer_made", "loi", "closed", "rejected",
] as const;
export type OutcomeEvent = (typeof OUTCOME_EVENTS)[number];

// Terminal events end the deal journey — a coded reason is mandatory on these (Upgrade 5).
export const TERMINAL_EVENTS: readonly OutcomeEvent[] = ["closed", "rejected"];

export const REASON_CODES = [
  "price_gap", "owner_unwilling", "legal_issue", "timing",
  "buyer_strategy_change", "technical_fit", "other",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const OUTCOME_LABELS: Record<OutcomeEvent, string> = {
  owner_identified: "Owner identified",
  owner_reachable: "Owner reachable",
  owner_willing: "Owner willing to sell",
  price_captured: "Price captured",
  legal_verification_passed: "Legal verification passed",
  buyer_interest: "Buyer interest",
  nda_signed: "NDA signed",
  diligence_started: "Diligence started",
  offer_made: "Offer made",
  loi: "LOI signed",
  closed: "Closed",
  rejected: "Rejected",
};

export const REASON_LABELS: Record<ReasonCode, string> = {
  price_gap: "Price gap",
  owner_unwilling: "Owner unwilling",
  legal_issue: "Legal issue",
  timing: "Timing",
  buyer_strategy_change: "Buyer strategy change",
  technical_fit: "Technical fit",
  other: "Other",
};
