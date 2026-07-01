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
  // Gate failed → the patent is still alive. This is a confident, reassuring "not a fit",
  // not a failure — it protects the buyer from wasting time on a maintained asset.
  if (!s.passedGate) {
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
