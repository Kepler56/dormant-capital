// components/RunHistory.tsx
// Why: every analysis run persists a score_computed event, and — since engine (provider+model)
// is recorded per run — the same patent can be run through different LLMs and compared side by
// side. This is a pure, server-compatible table: no hooks, all data pre-shaped by the page. When
// two or more runs exist we add a spread row (max−min per numeric column) so a buyer can see at a
// glance whether engines actually disagree, or whether the deterministic mapping just reproduces
// the same verdict regardless of which model read the evidence. The run list can mix scoring
// versions (e.g. scoring-v1 and scoring-v2 runs have different band cutoffs), so the spread is
// scoped to runs sharing the most recent run's version — otherwise an engine-agreement caption
// would be lying about a scoring-version delta.
import { Card, SectionLabel } from "./ui/Card";
import RouteBadge from "./RouteBadge";
import ScoreBadge from "./ScoreBadge";

export type RunHistoryRun = {
  at: string;
  version: string | null;
  engine: { provider: string; model: string } | null;
  route: string | null;
  dormancy: number | null;
  transactability: number | null;
  opportunity: number | null;
  execution: number | null;
  composite: number | null;
  band: string | null;
};

// Columns the spread row aggregates — every numeric score dimension.
const NUMERIC_COLS = ["dormancy", "transactability", "opportunity", "execution", "composite"] as const;
type NumericCol = (typeof NUMERIC_COLS)[number];
const SPREAD_THRESHOLD = 10;

function spreadOf(runs: RunHistoryRun[], col: NumericCol): number | null {
  const vals = runs.map((r) => r[col]).filter((v): v is number => typeof v === "number");
  if (vals.length < 2) return null;
  return Math.max(...vals) - Math.min(...vals);
}

// Short muted tag for a run's scoring version, e.g. "scoring-v2" -> "v2". Runs from before
// `version` was recorded in the score_computed payload carry null and show as "—".
function versionTag(version: string | null): string {
  if (!version) return "—";
  const parts = version.split("-");
  return parts[parts.length - 1] || version;
}

export default function RunHistory({ runs }: { runs: RunHistoryRun[] }) {
  if (runs.length < 1) return null;

  // Spread is scoped to runs sharing the most recent run's scoring version — mixing scoring-v1
  // and scoring-v2 runs (different band cutoffs) would otherwise read as engine disagreement
  // when it's really a scoring-engine change. Version-null runs (pre-dating the field) never
  // join the scope, so the spread never silently includes one.
  const latestVersion = runs[0]?.version ?? null;
  const versionScopedRuns = latestVersion === null ? [] : runs.filter((r) => r.version === latestVersion);
  const showSpread = versionScopedRuns.length >= 2;
  const spreads = Object.fromEntries(NUMERIC_COLS.map((c) => [c, spreadOf(versionScopedRuns, c)])) as Record<NumericCol, number | null>;
  const anyDisagreement = showSpread && NUMERIC_COLS.some((c) => (spreads[c] ?? 0) >= SPREAD_THRESHOLD);

  return (
    <section>
      <SectionLabel>Analysis runs</SectionLabel>
      <Card className="overflow-x-auto p-5">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">Ver.</th>
              <th className="py-2 pr-3 font-semibold">Engine</th>
              <th className="py-2 pr-3 font-semibold">Route</th>
              <th className="py-2 pr-3 text-right font-semibold">Dormancy</th>
              <th className="py-2 pr-3 text-right font-semibold">Transact.</th>
              <th className="py-2 pr-3 text-right font-semibold">Opportunity</th>
              <th className="py-2 pr-3 text-right font-semibold">Execution</th>
              <th className="py-2 pr-3 text-right font-semibold">Composite</th>
              <th className="py-2 pr-3 font-semibold">Band</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-2 pr-3 text-ink-soft">{new Date(r.at).toLocaleString()}</td>
                <td className="py-2 pr-3 text-xs font-medium text-muted">{versionTag(r.version)}</td>
                <td className="py-2 pr-3 font-mono text-xs text-ink-soft">
                  {r.engine?.provider && r.engine?.model ? `${r.engine.provider}/${r.engine.model}` : "—"}
                </td>
                <td className="py-2 pr-3">{r.route ? <RouteBadge route={r.route} /> : <span className="text-muted">—</span>}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">{r.dormancy ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">{r.transactability ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">{r.opportunity ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">{r.execution ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums font-semibold text-ink">{r.composite ?? "—"}</td>
                <td className="py-2 pr-3"><ScoreBadge band={r.band} compact /></td>
              </tr>
            ))}
          </tbody>
          {showSpread && (
            <tfoot>
              <tr className="border-t border-line text-xs font-semibold text-muted">
                <td className="py-2 pr-3" colSpan={4}>Spread (max − min), {versionTag(latestVersion)} runs only</td>
                {NUMERIC_COLS.filter((c) => c !== "composite").map((c) => (
                  <td
                    key={c}
                    className={`py-2 pr-3 text-right tabular-nums ${spreads[c] !== null && spreads[c]! >= SPREAD_THRESHOLD ? "text-amber-700" : ""}`}
                  >
                    {spreads[c] ?? "—"}
                  </td>
                ))}
                <td
                  className={`py-2 pr-3 text-right tabular-nums ${spreads.composite !== null && spreads.composite! >= SPREAD_THRESHOLD ? "text-amber-700" : ""}`}
                >
                  {spreads.composite ?? "—"}
                </td>
                <td className="py-2 pr-3" />
              </tr>
            </tfoot>
          )}
        </table>
        {anyDisagreement && (
          <p className="mt-3 text-xs text-amber-700">
            Runs disagree by ≥10 points on highlighted dimensions — evidence extraction differs between engines; the deterministic mapping is identical.
          </p>
        )}
      </Card>
    </section>
  );
}
