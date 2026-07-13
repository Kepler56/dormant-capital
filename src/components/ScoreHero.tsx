// components/ScoreHero.tsx
// Why: this is the user-facing answer — the FIRST thing a buyer sees on a patent. It
// leads with a verdict (plain language) and a big ring, then three supporting rings in
// friendly terms (Dormancy / Market value / Acquirability). Crucially it shows NO formula,
// NO weights, NO thresholds — just the result and what it means. The auditable math lives
// in the collapsible methodology panel further down the page.
import Gauge from "./ui/Gauge";
import type { ScoreResult } from "@/lib/scoring/compose";
import { verdictFor, SIGNAL_LABELS, TONE_CLASSES } from "@/lib/verdict";
import RouteBadge from "./RouteBadge";

function MiniRing({ value, color, label, hint }: { value: number | null; color: string; label: string; hint: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* null flows through to Gauge, which renders a dash over an empty arc —
          "not scored" must never read as "scored zero". */}
      <Gauge value={value} size={92} stroke={9} color={value === null ? "#CBD5E1" : color} />
      <div className="mt-2 text-sm font-semibold text-ink">{label}</div>
      <div className="mt-0.5 max-w-[150px] text-[11px] leading-snug text-muted">{hint}</div>
    </div>
  );
}

export default function ScoreHero({ s }: { s: ScoreResult }) {
  const v = verdictFor(s);
  const tone = TONE_CLASSES[v.tone];
  const cleared = s.passedGate;
  // Older `score_computed` payloads predate Gate 0 and carry no `route` — render nothing
  // extra for them (no badge, no transactability ring, no "blended" caption).
  const hasRoute = s.route != null;

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
      {/* Verdict band — coloured headline strip */}
      <div className="grid items-center gap-6 p-6 sm:p-8 md:grid-cols-[auto,1fr]">
        {/* Headline ring — the composite is still shown, but visually secondary once the
            four split scores below carry the real story. */}
        <div className="flex flex-col items-center gap-1.5 justify-center md:items-start md:justify-start">
          <Gauge value={v.ringValue} size={150} stroke={13} color={tone.ring} label={v.ringLabel} big />
          {cleared && s.composite != null && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Blended composite</span>
          )}
        </div>

        {/* Verdict copy */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${tone.chip}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.ring }} />
              {v.label}
            </span>
            {hasRoute && <RouteBadge route={s.route} flags={s.gate0?.flags} />}
          </div>
          <h2 className="mt-3 max-w-2xl font-display text-xl font-bold leading-snug text-ink sm:text-2xl">
            {v.headline}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{v.blurb}</p>
        </div>
      </div>

      {/* Supporting signals — Dormancy/Transactability/Opportunity/Execution as first-class
          split scores. Transactability comes from Gate 0 and is available even when the
          asset didn't clear the dormancy gate; Opportunity/Execution stay null (greyed
          rings) until scoring actually runs. Falls back to the original 3-ring layout for
          payloads with no route. */}
      {(cleared || hasRoute) && (
        <div className={`grid gap-2 border-t border-line bg-canvas/60 px-6 py-6 sm:px-8 ${hasRoute ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          <MiniRing value={s.dormancy} color="#1D4ED8" label={SIGNAL_LABELS.dormancy.label} hint={SIGNAL_LABELS.dormancy.hint} />
          {hasRoute && (
            <MiniRing value={s.transactability} color="#0EA5E9" label="Transactability" hint="How legally clean and available the exclusivity is" />
          )}
          <MiniRing value={s.opportunity} color="#3D5AF1" label={SIGNAL_LABELS.opportunity.label} hint={SIGNAL_LABELS.opportunity.hint} />
          <MiniRing value={s.execution} color="#8B5CF6" label={SIGNAL_LABELS.execution.label} hint={SIGNAL_LABELS.execution.hint} />
        </div>
      )}

      {/* Recommended next step — the Zest-style action card */}
      <div className={`flex items-start gap-3 border-t border-line px-6 py-5 sm:px-8 ${tone.soft}`}>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={tone.ring} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5 5L20 7" />
          </svg>
        </span>
        <div>
          <div className={`text-xs font-bold uppercase tracking-wide ${tone.text}`}>Recommended next step</div>
          <p className="mt-0.5 text-sm font-medium text-ink">{v.action}</p>
        </div>
      </div>
    </div>
  );
}
