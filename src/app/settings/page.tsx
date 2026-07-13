// app/settings/page.tsx
// Why: the control room for the scoring engine. Two cards, each answering one question a serious
// buyer would ask before trusting a verdict: "whose model runs this?" (you bring your own — there
// is no shared server model, so nothing runs until you add one) and "how is the score actually
// computed?" (deterministic weights + gate + bands, shown as a ruler — proof the AI never emits a
// score). Nothing here is form-edited except the engine choice; calibration is a versioned config
// change, never an ad-hoc tweak.
import { config } from "@/lib/scoring/config";
import { MAX_WEB_SEARCHES, MAX_RESEARCH_ITERATIONS } from "@/lib/agent/state";
import { SIGNAL_LABELS } from "@/lib/verdict";
import EngineField from "@/components/EngineField";

export const dynamic = "force-dynamic";

const SIGNAL_COLOR: Record<"dormancy" | "opportunity" | "execution", string> = {
  dormancy: "#1D4ED8",
  opportunity: "#3D5AF1",
  execution: "#8B5CF6",
};

// The agentic pipeline, spelled out for a buyer who wants to know exactly how a verdict is made.
const PIPELINE: { title: string; body: string }[] = [
  { title: "Plan", body: "The agent drafts a handful of targeted research questions across dormancy, market value and acquirability." },
  { title: "Search the web", body: `Grounded through your own model's web search — up to ${MAX_WEB_SEARCHES} searches, each returning cited sources.` },
  { title: "Extract evidence", body: "The model returns structured, schema-validated, cited evidence — never a score. Sourced facts stay separate from AI judgments." },
  { title: "Critique & re-search", body: `The agent inspects its own evidence for gaps and loops back to search up to ${MAX_RESEARCH_ITERATIONS} more times, then verifies each material claim against its source.` },
  { title: "Dormancy gate", body: `Data-first: a lapsed maintenance fee is the hero signal. Below the gate floor (${config.dormancyFloor}) the asset is "still active" and scoring stops.` },
  { title: "Compose", body: "Deterministic, config-driven weights turn the evidence into a 0–100 composite and a routing band." },
  { title: "Shadow check", body: `A second LLM independently proposes its own score; if it diverges by more than ${config.shadowAgreeThreshold} points it's flagged — but it never changes the verdict.` },
];

export default function SettingsPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">
          The engine that reads evidence, and the fixed rules that turn it into a verdict.
        </p>
      </div>

      {/* Analysis engine — the hero card. BYO provider/model/key is required to analyze. */}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lift">
        <div className="border-b border-line bg-canvas/60 px-6 py-5 sm:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-action-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-action-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-action" />
            Analysis engine
          </span>
          <h2 className="mt-3 font-display text-xl font-bold text-ink">Bring your own model</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Every analysis — reasoning and web search — runs on your own provider and key. Save as
            many named engine profiles as you like across OpenAI, Anthropic and Gemini, then pick
            which one runs each analysis — handy for comparing how different models score the same
            patent. Nothing runs on a shared server model, and keys never leave this browser except
            with each analysis.
          </p>
        </div>
        <div className="px-6 py-6 sm:px-8">
          <EngineField />
        </div>
      </section>

      {/* Scoring methodology — the full algorithm, laid out across the width: the agentic pipeline
          on the left, the deterministic maths (weights + bands) on the right. The AI never emits a
          score; the code on the right is what does. */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">How a verdict is made</h2>
            <p className="mt-0.5 text-sm text-ink-soft">Deterministic, config-driven — the model supplies cited evidence, code decides the score.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold text-brand-dark">Facts ≠ judgments</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-action-soft px-3 py-1 text-[11px] font-semibold text-action-dark">Dormancy is a gate, not a weight</span>
          </div>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {/* Left: the agentic pipeline, step by step */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">The pipeline</p>
            <ol className="relative space-y-4 border-l border-line pl-6">
              {PIPELINE.map((step, i) => (
                <li key={step.title} className="relative">
                  <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-[11px] font-bold text-brand-dark shadow-sm">
                    {i + 1}
                  </span>
                  <p className="text-sm font-semibold text-ink">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Right: the deterministic maths */}
          <div className="space-y-8">
            {/* Signal weights */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Signal weights</p>
              <div className="overflow-hidden rounded-full">
                <div className="flex h-3 w-full">
                  {(["dormancy", "opportunity", "execution"] as const).map((k) => (
                    <div key={k} style={{ width: `${config.weights[k] * 100}%`, background: SIGNAL_COLOR[k] }} />
                  ))}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {(["dormancy", "opportunity", "execution"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SIGNAL_COLOR[k] }} />
                    <span className="font-medium text-ink">{SIGNAL_LABELS[k].label}</span>
                    <span className="text-muted">— {SIGNAL_LABELS[k].hint}</span>
                    <span className="ml-auto font-semibold tabular-nums text-ink">{Math.round(config.weights[k] * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Routing bands ruler */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">Routing bands (composite 0–100)</p>
              <div className="relative h-2.5 rounded-full bg-idle-soft">
                <div className="absolute inset-y-0 left-0 rounded-full bg-watch-soft" style={{ width: `${config.bands.watch}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-good-soft" style={{ width: `${config.bands.route}%`, clipPath: `inset(0 0 0 ${config.bands.watch}%)` }} />
                <div className="absolute inset-y-0 rounded-full bg-good" style={{ left: `${config.bands.route}%`, right: 0 }} />
                <div
                  className="absolute -top-1 h-[18px] w-[2px] bg-ink"
                  style={{ left: `${config.dormancyFloor}%` }}
                  title={`Dormancy gate floor: ${config.dormancyFloor}`}
                />
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
                <span><span className="font-semibold text-ink">PASS</span> <span className="text-muted">below {config.bands.watch}</span></span>
                <span><span className="font-semibold text-amber-700">WATCH</span> <span className="text-muted">{config.bands.watch}–{config.bands.route}</span></span>
                <span><span className="font-semibold text-brand-dark">ROUTE</span> <span className="text-muted">≥ {config.bands.route}</span></span>
              </div>
            </div>

            {/* Gate callout */}
            <div className="rounded-xl border border-line bg-canvas/60 p-4">
              <p className="text-xs font-semibold text-ink">The dormancy gate (floor {config.dormancyFloor})</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Computed data-first from maintenance-fee history — the hero signal, never the LLM.
                An asset that scores below the floor is "still active" and never reaches the composite
                layer, so a maintained patent can never be routed as an opportunity.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
