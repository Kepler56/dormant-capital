// scoring/gate0.ts
// Why: the FIRST gate (brief v2, Upgrade 1). Before asking "is it dormant/valuable", ask
// "what is this asset legally, and can it be transacted at all?" — a public-domain patent
// has no seller and no exclusivity to sell, and routing one to a buyer as an acquisition
// would be a credibility-ending mistake. FACTS ONLY: legal status, dates and maintenance
// history come from source data; no LLM judgment is consulted here, ever.
import { config } from "./config";
import { yearsSinceLapse, yearsRemaining } from "./signals";
import type { ParsedPatent } from "@/lib/types";

export type LegalStatus = "active" | "expired_fee" | "expired_term" | "abandoned" | "unknown";
export type RouteType = "LICENSE_OR_ACQUIRE" | "REVIVAL" | "PUBLIC_DOMAIN_INTEL" | "TECH_INFO" | "TECHNOLOGY_PACKAGE" | "UNKNOWN";
export type Gate0Result = {
  legalStatus: LegalStatus;
  route: RouteType;
  transactable: "yes" | "conditional" | "no";
  transactabilityScore: number;   // 0-100, deterministic from route + facts
  flags: string[];                // e.g. "needs_legal_verification", "stale_lapse_low_revival_odds"
  reasons: string[];              // human-readable fact citations
};

export function runGate0(p: ParsedPatent, now: Date = new Date()): Gate0Result {
  const flags: string[] = [];
  const reasons: string[] = [];
  const term = yearsRemaining(p, now);
  const t = config.transactability;

  // Full-term expiry beats everything, including a recorded fee lapse: once the natural
  // term is over there is nothing left to revive — the technology is public domain.
  const pastTerm = p.anticipatedExpiration || (term !== null && term <= 0);
  if (pastTerm && !(p.maintenanceLapsed && term !== null && term > 0)) {
    reasons.push("Reached full term — technology is in the public domain; there is no exclusivity to sell.");
    return { legalStatus: "expired_term", route: "PUBLIC_DOMAIN_INTEL", transactable: "no",
      transactabilityScore: t.PUBLIC_DOMAIN_INTEL, flags,
      reasons: [...reasons, "Route: sell technology intelligence (freely-usable tech scouting), not exclusivity."] };
  }

  if (p.maintenanceLapsed) {
    flags.push("needs_legal_verification");
    reasons.push("Maintenance-fee lapse on record — possibly restorable, NOT automatically sellable today.");
    const stale = yearsSinceLapse(p, now);
    const plausible = stale === null || stale <= config.gate0.restorationWindowYears;
    if (!plausible) {
      flags.push("stale_lapse_low_revival_odds");
      reasons.push(`Lapse is ${stale!.toFixed(1)} years old — an "unintentional delay" petition gets harder to sustain.`);
    }
    reasons.push("Verify before transacting: restoration realistically possible, lapse plausibly unintentional, chain of title clean, no security interests, claims still valid and broad enough to matter.");
    return { legalStatus: "expired_fee", route: "REVIVAL", transactable: "conditional",
      transactabilityScore: plausible ? t.REVIVAL : t.REVIVAL_STALE, flags, reasons };
  }

  if (term !== null && term > 0) {
    const short = term < config.gate0.minTermYears;
    if (short) { flags.push("short_remaining_term"); reasons.push(`Only ~${term.toFixed(1)} years of term remain.`); }
    else reasons.push(`In force with ~${term.toFixed(1)} years of term remaining — clean license/acquisition candidate.`);
    const score: number = short ? Math.round(t.LICENSE_OR_ACQUIRE / 2) : t.LICENSE_OR_ACQUIRE;
    return { legalStatus: "active", route: "LICENSE_OR_ACQUIRE", transactable: "yes",
      transactabilityScore: score, flags, reasons };
  }

  flags.push("needs_data");
  reasons.push("Insufficient dated facts to classify legal status — treat as unverified.");
  return { legalStatus: "unknown", route: "UNKNOWN", transactable: "conditional",
    transactabilityScore: t.UNKNOWN, flags, reasons };
}
