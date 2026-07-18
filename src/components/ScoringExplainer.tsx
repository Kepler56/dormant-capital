// web/src/components/ScoringExplainer.tsx
// Why: a first-time user has no idea why the gate matters or what ROUTE/WATCH/PASS mean.
// This card answers those questions in plain language, pulling numbers directly from
// config so the explanation is always truthful when thresholds are recalibrated.
// It is a pure display component with no data fetching — the page passes nothing in.
import { config } from "@/lib/scoring/config";

export default function ScoringExplainer() {
  const { dormancyFloor, weights, bands, dormancyPoints: pts, staleLapseYears } = config;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        How scoring works
      </h3>

      <div className="space-y-3">
        {/* Step 1: the gate — most important concept, and the one users ask about. The point
            values are spelled out because "the primary signal is a maintenance-fee lapse" does
            not explain why nearly every analyzed patent scores exactly 83. The arithmetic does. */}
        <div>
          <span className="font-medium text-ink">1. Dormancy score &amp; gate (threshold: {dormancyFloor})</span>
          <p className="mt-0.5 text-slate-500">
            The dormancy score is a sum of a few observable signals, not a model opinion:
          </p>
          <ul className="mt-1.5 space-y-1 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <li><span className="inline-block w-10 font-mono font-semibold tabular-nums">{pts.base}</span> every patent starts here (below the floor — presumed active)</li>
            <li><span className="inline-block w-10 font-mono font-semibold tabular-nums">+{pts.maintenanceLapsed}</span> owner stopped paying USPTO renewal fees</li>
            <li><span className="inline-block w-10 font-mono font-semibold tabular-nums">+{pts.staleLapse}</span> that lapse is over {staleLapseYears} years old, unreinstated</li>
            <li><span className="inline-block w-10 font-mono font-semibold tabular-nums">+{pts.noProduct}</span> research found no product on the market</li>
            <li><span className="inline-block w-10 font-mono font-semibold tabular-nums">+{pts.noDevelopment}</span> research found no active development</li>
            <li><span className="inline-block w-10 font-mono font-semibold tabular-nums">{pts.activeLitigation}</span> the patent is being actively litigated</li>
          </ul>
          <p className="mt-1.5 text-slate-500">
            The fee lapse is the only signal that can clear the floor on its own, which is why most
            dormant candidates land on the same few values — a lapsed patent with a settled lapse
            scores {pts.base} + {pts.maintenanceLapsed} + {pts.staleLapse} = <strong>{pts.base + pts.maintenanceLapsed + pts.staleLapse}</strong>.
            That repetition is the scoring working, not a stuck number: patents that match on the
            measured signals get the same score by design. Below {dormancyFloor}, the asset is
            treated as <em>not dormant</em> and no further scoring runs.
          </p>
        </div>

        {/* Step 2: composite formula */}
        <div>
          <span className="font-medium text-ink">2. Composite score (gate cleared)</span>
          <p className="mt-0.5 text-slate-500">
            When dormancy clears the gate, a weighted composite is computed from three dimensions:
          </p>
          <p className="mt-1 rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
            Composite = {weights.dormancy}·Dormancy + {weights.opportunity}·Opportunity + {weights.execution}·Execution
          </p>
        </div>

        {/* Step 3: routing bands. "PASS" is deliberately spelled out here because the word does
            double duty — a low composite AND an asset that never cleared the gate both land on
            it. Elsewhere in the UI users see the plain-language verdict instead of the token. */}
        <div>
          <span className="font-medium text-ink">3. Routing bands</span>
          <p className="mt-0.5 text-slate-500">
            The composite maps to a band: ≥{bands.route} →{" "}
            <span className="font-medium text-brand-dark">ROUTE</span> (actionable lead),{" "}
            ≥{bands.watch} →{" "}
            <span className="font-medium text-amber-700">WATCH</span> (monitor), below →{" "}
            <span className="font-medium text-slate-500">PASS</span> (not prioritized).
          </p>
          <p className="mt-1 text-xs text-slate-400">
            &ldquo;PASS&rdquo; here means <em>passed over</em>, not &ldquo;passed the test&rdquo;. An asset that never
            cleared the dormancy gate is also recorded as PASS, which is why the verdict shown
            elsewhere is written in plain language rather than as this token.
          </p>
        </div>

        {/* Step 4: LLM role clarification */}
        <div>
          <span className="font-medium text-ink">4. The LLM&apos;s role</span>
          <p className="mt-0.5 text-slate-500">
            The model extracts cited evidence (snippets + confidence) — it never outputs a score.
            Deterministic, config-driven code converts the evidence into numbers. This makes the
            score reproducible to the model version and auditable without re-running the model.
          </p>
        </div>
      </div>
    </div>
  );
}
