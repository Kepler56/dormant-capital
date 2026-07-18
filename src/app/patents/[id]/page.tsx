// web/src/app/patents/[id]/page.tsx
// Why: the patent detail page is now USER-FIRST. A buyer sees, in order: who/what this is,
// a plain-language verdict with score rings (ScoreHero), the evidence the AI found (with
// sources), and then — only if they want it — a collapsed "Audit & methodology" panel that
// holds the full scoring math, the formula explainer, the immutable sourced facts and the
// append-only event log. Nothing is hidden from those who look; it's just not shouted at
// people who only need the answer. Stays a Server Component (reads the DB directly).
import { notFound } from "next/navigation";
import Link from "next/link";
import { getFacts, getJudgments, getEvents } from "@/lib/db/queries";
import { patentsHrefFrom } from "@/lib/patents/filters";
import { get } from "@/lib/db/connection";
import type { ScoreResult } from "@/lib/scoring/compose";
import FactTable from "@/components/FactTable";
import JudgmentList from "@/components/JudgmentList";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import ScoringExplainer from "@/components/ScoringExplainer";
import EventTimeline from "@/components/EventTimeline";
import AnalyzeButton from "@/components/AnalyzeButton";
import { verdictFor, TONE_CLASSES } from "@/lib/verdict";
import ScoreHero from "@/components/ScoreHero";
import { SectionLabel } from "@/components/ui/Card";
import AgentTrace from "@/components/AgentTrace";
import RunHistory, { type RunHistoryRun } from "@/components/RunHistory";
import DealJourney from "@/components/DealJourney";
import BuyerFitPanel from "@/components/BuyerFitPanel";
import { listOutcomes } from "@/lib/outcomes/queries";
import { listMandates } from "@/lib/mandates/queries";
import type { TraceEvent } from "@/lib/agent/state";

export const dynamic = "force-dynamic";

export default async function PatentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const id = Number((await params).id);
  // `from` carries the filter query string of the list page the user arrived from, so the back
  // link returns to their filtered view rather than a reset catalogue. patentsHrefFrom validates
  // it against the shared filter whitelist and falls back to a bare "/patents" — arrivals that
  // carry no filter context (dashboard, batch panel, a pasted URL) simply get the plain link.
  const backHref = patentsHrefFrom((await searchParams)?.from);
  const asset = await get<{ id: number; external_id: string }>("SELECT * FROM asset WHERE id=?", [id]);
  if (!asset) notFound();

  const [facts, judgments, events, outcomes, mandates] = await Promise.all([
    getFacts(id), getJudgments(id), getEvents(id), listOutcomes(id), listMandates(),
  ]);
  const buyerFitJudgments = judgments.filter((j) => j.dimension === "buyer_fit");

  // Why: one reverse + one filter over the event list gives every score_computed run, newest
  // first — the latest entry doubles as "lastEvent" (its payload carries the deterministic
  // result, the non-authoritative shadow LLM score + its divergence, and the full agent
  // reasoning trace) while the full list feeds RunHistory's cross-engine comparison table.
  // Avoids a second reverse-scan of the same event list to build the run history separately.
  type ScoreEventPayload = ScoreResult & {
    shadow?: { composite: number; verdict: string; rationale: string } | null;
    divergence?: { delta: number; agree: boolean } | null;
    trace?: TraceEvent[];
    engine?: { provider: string; model: string } | null;
  };
  const scoreEvents = [...events].reverse().filter((e) => e.event_type === "score_computed");
  const lastEvent = scoreEvents[0]?.payload as ScoreEventPayload | undefined;
  const lastScore = (lastEvent ?? null) as ScoreResult | null;
  const shadow = lastEvent?.shadow ?? null;
  const divergence = lastEvent?.divergence ?? null;
  const trace = lastEvent?.trace ?? null;

  // Runs for the comparison table — tolerant of old payloads that predate engine/route/
  // transactability/version (they render as "—"/null rather than throwing). Every missing field
  // maps to null — never a display literal — so components render their own honest empty state
  // (ScoreBadge shows a dash for a null band instead of fabricating a PASS pill). `version` lets
  // RunHistory scope its spread row to runs sharing the latest scoring version, so a v1→v2
  // scoring-engine change is never mistaken for cross-engine disagreement.
  const runs: RunHistoryRun[] = scoreEvents.map((e) => {
    const p = (typeof e.payload === "object" && e.payload !== null ? e.payload : {}) as Partial<ScoreEventPayload>;
    return {
      at: e.created_at,
      version: p.version ?? null,
      engine: p.engine ?? null,
      route: p.route ?? null,
      dormancy: p.dormancy ?? null,
      transactability: p.transactability ?? null,
      opportunity: p.opportunity ?? null,
      execution: p.execution ?? null,
      composite: p.composite ?? null,
      band: p.band ?? null,
    };
  });

  const factMap = Object.fromEntries(
    facts.map((f) => [f.key, typeof f.value === "string" ? f.value : JSON.stringify(f.value)])
  );

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Back to patents
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-canvas px-2.5 py-1 font-mono text-sm font-semibold text-ink-soft">{asset.external_id}</span>
            {/* Uses verdictFor — the same translation layer ScoreHero uses — rather than the raw
                band. ScoreBadge is band-only, so on a Gate 0 route it rendered "Not a fit" (band
                PASS) directly above a hero reading "Public-domain intel", i.e. the page
                contradicted itself in two adjacent elements. */}
            {lastScore && (() => {
              const v = verdictFor(lastScore);
              return (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[v.tone].chip}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_CLASSES[v.tone].ring }} />
                  {v.label}
                </span>
              );
            })()}
          </div>
          {factMap.title && <h1 className="mt-2.5 max-w-3xl font-display text-2xl font-bold leading-tight text-ink">{factMap.title}</h1>}
          {factMap.assignee && (
            <p className="mt-1 text-sm text-ink-soft">
              <span className="text-muted">Last known owner:</span> {factMap.assignee}
            </p>
          )}
          {!lastScore && (
            <p className="mt-2.5 text-sm text-muted">Not analyzed yet — run an analysis to get a verdict.</p>
          )}
        </div>
        <div className="shrink-0">
          <AnalyzeButton assetId={id} num={asset.external_id} />
        </div>
      </div>

      {/* ── The answer ─────────────────────────────────────────────────────── */}
      {lastScore ? (
        <ScoreHero s={lastScore} />
      ) : (
        <div className="rounded-3xl border border-dashed border-line bg-surface p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-brand" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2" /></svg>
          </div>
          <p className="mt-4 font-display text-lg font-bold text-ink">Ready to analyze</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
            We&apos;ll check whether this patent is dormant, how valuable the technology is, and how cleanly a buyer could acquire it — then give you a clear verdict and the evidence behind it.
          </p>
        </div>
      )}

      {/* ── Evidence the AI found ──────────────────────────────────────────── */}
      {judgments.length > 0 && (
        <section>
          <SectionLabel>What we found</SectionLabel>
          <JudgmentList judgments={judgments} />
        </section>
      )}

      {/* ── Engine vs. autonomous analyst — non-authoritative shadow comparison ── */}
      {shadow && lastScore?.composite != null && (
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink">Engine vs. autonomous analyst</span>
            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${divergence?.agree ? "bg-good-soft text-brand-dark" : "bg-watch-soft text-amber-700"}`}>
              {divergence?.agree ? "Agree" : `Differ by ${divergence?.delta}`}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs font-medium text-muted">Deterministic engine (authoritative)</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">{lastScore.composite}</p>
            </div>
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs font-medium text-muted">Autonomous LLM analyst (reference)</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">{shadow.composite} <span className="text-sm font-semibold text-ink-soft">{shadow.verdict}</span></p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-soft">{shadow.rationale}</p>
        </section>
      )}

      {trace && trace.length > 0 && (
        <section>
          <AgentTrace events={trace} />
        </section>
      )}

      {/* ── Run history & cross-engine comparison ─────────────────────────── */}
      <RunHistory runs={runs} />

      {/* ── Buyer fit — score this asset against a mandate's thesis ─────────── */}
      <BuyerFitPanel assetId={id} mandates={mandates} judgments={buyerFitJudgments} />

      {/* ── Deal journey — the micro-outcome ledger, one row per buyer-journey step ── */}
      <DealJourney assetId={id} initial={outcomes} />

      {/* ── Audit & methodology — collapsed by default, available to anyone ─── */}
      <details className="group rounded-2xl border border-line bg-surface shadow-soft">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
          <div>
            <span className="text-sm font-bold text-ink">Audit &amp; methodology</span>
            <p className="mt-0.5 text-xs text-muted">The exact scoring math, the sourced facts behind it, and the full activity log.</p>
          </div>
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </summary>

        <div className="space-y-6 border-t border-line px-6 py-6">
          {lastScore && (
            <div>
              <SectionLabel>How this score was computed</SectionLabel>
              <ScoreBreakdown s={lastScore} />
            </div>
          )}
          <ScoringExplainer />
          <div>
            <SectionLabel>Sourced facts — immutable, every value traces to a source</SectionLabel>
            <div className="rounded-2xl border border-line bg-surface p-5">
              <FactTable facts={facts} />
            </div>
          </div>
          <div>
            <SectionLabel>Activity log — append-only</SectionLabel>
            <div className="rounded-2xl border border-line bg-surface p-5">
              <EventTimeline events={events} />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
