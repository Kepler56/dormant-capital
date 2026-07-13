// lib/verdict.ts
// Why: the END USER should never read "composite ≥ 70" or see the weighting formula —
// they need to know WHAT the result means and WHAT to do next. This pure module is the
// single translation layer from the internal ScoreResult (band + gate + sub-scores) into
// human language: a verdict label, a tone for colour, a one-line headline, a short
// plain-English explanation, and a recommended next step. The math still exists and is
// auditable — it just lives behind the "Audit & methodology" panel, not in the headline.
import type { ScoreResult } from "@/lib/scoring/compose";

export type Tone = "good" | "watch" | "idle";

export type Verdict = {
  label: string; // short chip text, e.g. "Strong opportunity"
  tone: Tone;
  headline: string; // one confident sentence for the hero
  blurb: string; // 1–2 plain sentences explaining the call, no numbers
  action: string; // the recommended next step
  /** 0–100 headline number to show in the hero ring (composite, or the dormancy
   *  signal when the asset never reached full scoring). Never labelled "composite". */
  ringValue: number;
  ringLabel: string;
};

// Friendly labels for the three sub-signals — chosen so a non-technical buyer understands
// each without the underlying weight. Order matches the hero's supporting rings.
export const SIGNAL_LABELS = {
  dormancy: { label: "Dormancy", hint: "How clearly the owner has walked away" },
  opportunity: { label: "Market value", hint: "How commercially relevant the technology is" },
  execution: { label: "Acquirability", hint: "How cleanly a buyer could take it on" },
} as const;

export function verdictFor(s: ScoreResult): Verdict {
  // Gate failed → not passed straight through to composite scoring. Older payloads (before
  // Gate 0 existed) have no `route` field at all, so every branch below is guarded on it —
  // when absent, execution falls straight through to the original "still active" case,
  // unchanged.
  if (!s.passedGate) {
    // Gate 0 short-circuit: full-term expiry. This is NOT a dead end — the technology has
    // no exclusivity left to sell, but it is still a candidate for a tech-intelligence
    // product. Saying "still active" here would be the opposite of reality.
    if (s.route === "PUBLIC_DOMAIN_INTEL") {
      return {
        label: "Public-domain intel",
        tone: "watch",
        headline: "Public domain — no exclusivity to sell; candidate for technology-intelligence product.",
        blurb:
          "This patent has reached its full term, so there is no exclusivity left to license or sell. The underlying technology can still be packaged as a freely-usable tech-scouting or intelligence product.",
        action: "Package as technology intelligence rather than routing as an acquisition.",
        ringValue: s.dormancy,
        ringLabel: "Dormancy signal",
      };
    }
    // Gate 0 short-circuit: application that never granted. No enforceable rights exist,
    // so there is nothing to license or acquire — but the disclosure itself can still be
    // useful as reference material.
    if (s.route === "TECH_INFO") {
      return {
        label: "Technical info only",
        tone: "idle",
        headline: "Application without subsisting rights — technical information only.",
        blurb:
          "This application never granted, so there are no enforceable rights to license or acquire. It may still be useful as prior-art or technical reference material.",
        action: "No acquisition action — treat as reference material only, not a sellable asset.",
        ringValue: s.dormancy,
        ringLabel: "Dormancy signal",
      };
    }
    // REVIVAL that FAILED the dormancy gate: a fee lapse IS on record (that's what forced
    // the route), so "still being maintained" would contradict the gate0 reasons shown
    // right below. What actually happened: residual signals (litigation, a live product,
    // ongoing development) pulled dormancy under the floor — the asset looks contested or
    // in play, not walked away from.
    if (s.route === "REVIVAL") {
      return {
        label: "Lapsed, not dormant",
        tone: "watch",
        headline:
          "Fee lapse on record, but dormancy is not confirmed — signals suggest the asset is still contested or in play.",
        blurb:
          "A maintenance-fee lapse exists, yet other signals — litigation, a live product or ongoing development — indicate the owner hasn't truly walked away. The reasons below spell out exactly what pulled the dormancy call under.",
        action: "Review the reasons list before acting; revisit if the conflicting activity dies down.",
        ringValue: s.dormancy,
        ringLabel: "Dormancy signal",
      };
    }
    // Gate 0 couldn't classify legal status from the facts on hand (still "conditional" —
    // not ruled out, just unverified). A cautious variant, distinct from "still active".
    if (s.route === "UNKNOWN" && s.gate0?.transactable === "conditional") {
      return {
        label: "Status unverified",
        tone: "watch",
        headline: "Legal status unverified — not enough dated facts to classify.",
        blurb:
          "We don't have enough dated facts (filing, grant or expiry) to determine this asset's legal status with confidence. Any route here is provisional until it's verified.",
        action: "Gather the missing filing/grant/expiry facts before making a transaction decision.",
        ringValue: s.dormancy,
        ringLabel: "Dormancy signal",
      };
    }
    // Default (LICENSE_OR_ACQUIRE that isn't dormant, and pre-Gate-0 payloads with no
    // `route` at all): still active.
    return {
      label: "Still active",
      tone: "idle",
      headline: "This patent is still being maintained — not a dormant opportunity.",
      blurb:
        "The owner is keeping this patent alive, so it isn't available as a dormant asset. We screened it out before spending any further analysis on it.",
      action: "No action needed. Browse the catalogue for dormant candidates instead.",
      ringValue: s.dormancy,
      ringLabel: "Dormancy signal",
    };
  }

  const composite = s.composite ?? 0;
  if (s.band === "ROUTE") {
    return {
      label: "Strong opportunity",
      tone: "good",
      headline: "A dormant, valuable patent that's worth routing to a buyer.",
      blurb:
        "The owner appears to have abandoned this patent, yet the underlying technology still looks commercially relevant and cleanly ownable. That combination is exactly what institutional buyers look for.",
      action: "Route this to your buyer shortlist and open a sourcing conversation.",
      ringValue: composite,
      ringLabel: "Opportunity",
    };
  }
  if (s.band === "WATCH") {
    return {
      label: "Worth watching",
      tone: "watch",
      headline: "A dormant patent with promise, but a softer case.",
      blurb:
        "This patent reads as dormant and has real merit, but one or more signals — market relevance or how cleanly it can be acquired — are weaker. It's worth keeping on the radar rather than acting on immediately.",
      action: "Add to your watchlist and revisit if the market signal strengthens.",
      ringValue: composite,
      ringLabel: "Opportunity",
    };
  }
  // Gate cleared but composite low → dormant but not attractive.
  return {
    label: "Low priority",
    tone: "idle",
    headline: "Dormant, but the opportunity is thin.",
    blurb:
      "The patent does look dormant, but the commercial value and acquirability don't make a compelling case right now. It's unlikely to be worth a buyer's time.",
    action: "Deprioritise. Keep it in the catalogue but don't route it.",
    ringValue: composite,
    ringLabel: "Opportunity",
  };
}

// Tone → tailwind class fragments, kept in one place so chips/rings stay consistent.
export const TONE_CLASSES: Record<Tone, { chip: string; ring: string; soft: string; text: string }> = {
  good: { chip: "bg-good-soft text-brand-dark ring-1 ring-inset ring-good/30", ring: "#1D4ED8", soft: "bg-good-soft", text: "text-brand-dark" },
  watch: { chip: "bg-watch-soft text-amber-700 ring-1 ring-inset ring-watch/30", ring: "#F5A623", soft: "bg-watch-soft", text: "text-amber-700" },
  idle: { chip: "bg-idle-soft text-ink-soft ring-1 ring-inset ring-idle/30", ring: "#94A3B8", soft: "bg-idle-soft", text: "text-ink-soft" },
};
