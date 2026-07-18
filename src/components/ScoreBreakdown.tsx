// web/src/components/ScoreBreakdown.tsx
// Why: makes the gated math VISUAL and obvious — the dormancy gate outcome is shown
// first and prominently, because it determines whether scoring continues at all. If the
// gate cleared, three mini stat tiles show the weighted inputs and the composite. The
// reasons list answers "why did the gate produce this outcome?" without hunting through
// raw JSON. Consumers pass the ScoreResult directly from the score_computed event payload.
import ScoreBadge from "./ScoreBadge";
import type { ScoreResult } from "@/lib/scoring/compose";
import type { ScoreTerm } from "@/lib/scoring/gate";
import { config } from "@/lib/scoring/config";

// A compact numeric tile showing one scoring dimension with its weight label.
function StatTile({ label, weight, value }: { label: string; weight: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value ?? "—"}</div>
      <div className="text-[10px] text-slate-400">{weight}</div>
    </div>
  );
}

// Where a term came from, in the user's language. An LLM-derived term is a judgment and is
// labelled as one; a USPTO term is a record fact. Showing this next to the points is what stops
// the sum reading as one undifferentiated "algorithm said so".
const ORIGIN_LABEL: Record<ScoreTerm["origin"], string> = {
  baseline: "Starting point",
  uspto_record: "USPTO record",
  llm: "AI research",
};

// The dormancy arithmetic, line by line. This is the answer to "why is it always 83?" — the score
// is a sum of a few named signals, so two patents that match on those signals SHOULD match on the
// score. Seeing the terms makes that obvious; seeing only the total makes it look stuck.
function DormancyMath({ s }: { s: ScoreResult }) {
  if (!s.dormancyTerms?.length) return null; // older payloads predate per-term capture
  // Derived rather than trusted: if the listed terms don't add up to the displayed score, say so
  // instead of rendering a sum that visibly doesn't work. The 0-100 clamp is the expected cause.
  const sum = s.dormancyTerms.reduce((n, t) => n + t.points, 0);
  const clamped = sum !== s.dormancy;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        How the dormancy score was built
      </div>
      <ul className="divide-y divide-slate-100">
        {s.dormancyTerms.map((t) => (
          <li key={t.key} className="flex items-start gap-3 px-4 py-2.5">
            <span className={`mt-0.5 w-12 shrink-0 text-right text-sm font-semibold tabular-nums ${t.points < 0 ? "text-bad" : "text-ink"}`}>
              {t.points > 0 ? `+${t.points}` : t.points}
            </span>
            <span className="min-w-0">
              <span className="text-sm font-medium text-ink">{t.label}</span>
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                {ORIGIN_LABEL[t.origin]}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{t.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-ink">{s.dormancy}</span>
        <span className="text-sm font-semibold text-ink">Dormancy score</span>
        {clamped && <span className="text-xs text-slate-500">(sum {sum}, clamped to the 0–100 range)</span>}
        <span className="ml-auto text-xs text-slate-500">
          floor {config.dormancyFloor} — {s.dormancy >= config.dormancyFloor ? "cleared" : "not cleared"}
        </span>
      </div>
    </div>
  );
}

export default function ScoreBreakdown({ s }: { s: ScoreResult | null }) {
  if (!s) return null; // outer caller handles the "not analyzed" empty state

  // Gate verdict line: the single most important fact — did dormancy clear the threshold?
  // `stopReason` (not the bare passedGate boolean) decides the wording: a Gate 0 exit carries a
  // real dormancy score and must NOT be described as failing the dormancy floor. Rendering the
  // floor comparison unconditionally used to print "not dormant (dormancy 83 < floor 40)".
  const gateCleared = s.passedGate;
  const gateLabel = gateCleared
    ? `Dormancy gate cleared — ${s.dormancy} ≥ floor ${config.dormancyFloor}`
    : s.stopReason === "not_transactable"
      ? `Stopped before dormancy — this asset is not transactable (${s.route})`
      : `Not dormant — ${s.dormancy} is below the floor of ${config.dormancyFloor}`;
  const gateNote = gateCleared
    ? null
    : s.stopReason === "not_transactable"
      ? "There is no exclusivity left to sell, so opportunity and execution were not scored."
      : "Scoring stopped here; the asset does not look abandoned.";

  return (
    <div className="space-y-4">
      {/* Gate verdict — always shown, always first */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          gateCleared
            ? "border-accent-soft bg-accent-soft text-accent-dark"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {gateLabel}
        {gateNote && <span className="ml-2 text-xs font-normal text-slate-500">— {gateNote}</span>}
      </div>

      {/* The dormancy arithmetic — shown ALWAYS, including on both stop paths, because the
          dormancy score exists (and is the number the user is staring at) either way. */}
      <DormancyMath s={s} />

      {/* Full scoring breakdown — only shown when gate cleared. Weights come from config rather
          than hardcoded strings, so a recalibration can't leave this panel quietly disagreeing
          with the formula shown in ScoringExplainer. */}
      {gateCleared && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Dormancy" weight={`×${config.weights.dormancy}`} value={s.dormancy} />
          <StatTile label="Opportunity" weight={`×${config.weights.opportunity}`} value={s.opportunity} />
          <StatTile label="Execution" weight={`×${config.weights.execution}`} value={s.execution} />
        </div>
      )}

      {/* Composite + band — only shown when gate cleared */}
      {gateCleared && s.composite !== null && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <span className="text-sm text-slate-500">Composite</span>
          <span className="text-xl font-semibold tabular-nums text-ink">{s.composite}</span>
          <span className="text-slate-300">·</span>
          <ScoreBadge band={s.band} />
        </div>
      )}

      {/* Reasons list — present when gate failed (explains why) or after scoring */}
      {s.reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-500">
          {s.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
