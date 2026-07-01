// web/src/components/ScoreBreakdown.tsx
// Why: makes the gated math VISUAL and obvious — the dormancy gate outcome is shown
// first and prominently, because it determines whether scoring continues at all. If the
// gate cleared, three mini stat tiles show the weighted inputs and the composite. The
// reasons list answers "why did the gate produce this outcome?" without hunting through
// raw JSON. Consumers pass the ScoreResult directly from the score_computed event payload.
import ScoreBadge from "./ScoreBadge";
import type { ScoreResult } from "@/lib/scoring/compose";
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

export default function ScoreBreakdown({ s }: { s: ScoreResult | null }) {
  if (!s) return null; // outer caller handles the "not analyzed" empty state

  // Gate verdict line: the single most important fact — did dormancy clear the threshold?
  const gateCleared = s.passedGate;
  const gateLabel = gateCleared
    ? `Gate: cleared — dormancy ${s.dormancy} ≥ floor ${config.dormancyFloor}`
    : `Gate: PASS — not dormant (dormancy ${s.dormancy} < floor ${config.dormancyFloor})`;

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
        {!gateCleared && (
          <span className="ml-2 text-xs font-normal text-slate-500">
            — scoring stopped here; asset is not dormant
          </span>
        )}
      </div>

      {/* Full scoring breakdown — only shown when gate cleared */}
      {gateCleared && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Dormancy" weight="×0.40" value={s.dormancy} />
          <StatTile label="Opportunity" weight="×0.35" value={s.opportunity} />
          <StatTile label="Execution" weight="×0.25" value={s.execution} />
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
