// web/src/components/ScoringExplainer.tsx
// Why: a first-time user has no idea why the gate matters or what ROUTE/WATCH/PASS mean.
// This card answers those questions in plain language, pulling numbers directly from
// config so the explanation is always truthful when thresholds are recalibrated.
// It is a pure display component with no data fetching — the page passes nothing in.
import { config } from "@/lib/scoring/config";

export default function ScoringExplainer() {
  const { dormancyFloor, weights, bands } = config;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        How scoring works
      </h3>

      <div className="space-y-3">
        {/* Step 1: the gate — most important concept */}
        <div>
          <span className="font-medium text-ink">1. Dormancy gate (threshold: {dormancyFloor})</span>
          <p className="mt-0.5 text-slate-500">
            Scoring starts with a dormancy check. If the dormancy score is below {dormancyFloor}, the asset is
            considered <em>not dormant</em> — it returns <strong>PASS</strong> immediately and no further
            scoring runs. The primary signal is an observable maintenance-fee lapse; the LLM handles
            only the residual unstructured question (product presence, active litigation).
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

        {/* Step 3: routing bands */}
        <div>
          <span className="font-medium text-ink">3. Routing bands</span>
          <p className="mt-0.5 text-slate-500">
            The composite maps to a band: ≥{bands.route} →{" "}
            <span className="font-medium text-brand-dark">ROUTE</span> (actionable lead),{" "}
            ≥{bands.watch} →{" "}
            <span className="font-medium text-amber-700">WATCH</span> (monitor), below →{" "}
            <span className="font-medium text-slate-500">PASS</span> (not prioritized).
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
