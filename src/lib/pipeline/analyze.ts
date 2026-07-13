// pipeline/analyze.ts
// Why: the token-spending half, now agent-driven. It rebuilds a ParsedPatent from immutable
// facts (never writing them), runs the reflective LangGraph agent, STREAMS each trace event to
// the caller (SSE), then persists the versioned judgments + the shadow score + the full trace +
// an event_log entry. The deterministic result remains authoritative; the shadow is stored
// separately under the 'shadow' dimension. deps is injectable for tests; production uses
// defaultDeps(cfg) which binds the user's BYO config to every LLM call and web search.
import { getFacts, insertJudgment, appendEvent, getEvents } from "@/lib/db/queries";
import { runGraph, defaultDeps } from "@/lib/agent/graph";
import type { AgentDeps, TraceEvent, ShadowScore, Divergence } from "@/lib/agent/state";
import type { LLMConfig } from "@/lib/llm/config";
import type { ScoreResult } from "@/lib/scoring/compose";
import { type ParsedPatent } from "@/lib/types";
import { PROMPT_VERSION as DORM_V } from "@/lib/prompts/dormancy-residual";
import { PROMPT_VERSION as OE_V } from "@/lib/prompts/opportunity-execution";
import { SHADOW_VERSION } from "@/lib/prompts/shadow-score";
import { SCORING_VERSION } from "@/lib/scoring/config";

export type AnalyzeResult = { result: ScoreResult; shadow: ShadowScore | null; divergence: Divergence | null };

// Rebuild a ParsedPatent from stored facts (a fact key/value map). Facts are read-only here;
// this module never writes the fact table.
async function factsToParsed(assetId: number, num: string): Promise<ParsedPatent> {
  const m = new Map((await getFacts(assetId)).map((f) => [f.key, f.value]));
  const g = <T>(k: string, d: T): T => (m.has(k) ? (m.get(k) as T) : d);
  return {
    patentNumber: num, title: g("title", null), abstract: g("abstract", null),
    assignee: g("assignee", null), inventors: g("inventors", []),
    filingDate: g("filing_date", null), grantDate: g("grant_date", null),
    priorityDate: g("priority_date", null), expiryDate: g("expiry_date", null),
    cpcClasses: g("cpc_classes", []), forwardCitations: g("forward_citations", null),
    backwardCitations: g("backward_citations", null), legalEvents: g("legal_events", []),
    maintenanceLapsed: g("maintenance_lapsed", false), anticipatedExpiration: g("anticipated_expiration", false),
  };
}

export async function* runAnalysis(
  assetId: number, num: string, cfg?: LLMConfig | null, deps?: AgentDeps
): AsyncGenerator<TraceEvent, AnalyzeResult, void> {
  const patent = await factsToParsed(assetId, num);
  const gen = runGraph({ assetId, num, patent }, deps ?? defaultDeps(cfg));

  let r = await gen.next();
  while (!r.done) { yield r.value; r = await gen.next(); }
  const s = r.value; // final AgentStateT

  const result = s.result!;
  const trace = s.trace ?? [];
  const shadow = s.shadow ?? null;
  const divergence = s.divergence ?? null;

  // Persist judgments. Dormancy always; opp/exec only when the gate passed; shadow when present.
  await insertJudgment(assetId, {
    dimension: "dormancy", subDimension: "residual", score: result.dormancy,
    confidence: s.dormancy?.product_exists.confidence ?? null, rationale: result.reasons.join(" "),
    flags: s.dormancy, sources: s.sources.map((x) => ({ source: "web", title: x.title, url: x.url })),
    modelVersion: s.dormancyModel || "unknown", promptVersion: DORM_V,
  });
  if (result.passedGate && s.oppExec) {
    await insertJudgment(assetId, { dimension: "opportunity", subDimension: "composite", score: result.opportunity,
      confidence: s.oppExec.commercial_relevance.confidence, rationale: "Opportunity evidence extracted.",
      flags: s.oppExec, sources: [{ source: "llm:" + s.oppExecModel }], modelVersion: s.oppExecModel || "unknown", promptVersion: OE_V });
    await insertJudgment(assetId, { dimension: "execution", subDimension: "composite", score: result.execution,
      confidence: s.oppExec.ownership_clarity.confidence, rationale: "Execution evidence extracted.",
      flags: s.oppExec, sources: [{ source: "llm:" + s.oppExecModel }], modelVersion: s.oppExecModel || "unknown", promptVersion: OE_V });
  }
  if (shadow) {
    await insertJudgment(assetId, { dimension: "shadow", subDimension: "llm", score: shadow.composite,
      confidence: null, rationale: shadow.rationale, flags: { verdict: shadow.verdict, divergence },
      sources: [{ source: "llm:" + s.shadowModel }], modelVersion: s.shadowModel || "unknown", promptVersion: SHADOW_VERSION });
  }
  // Transactability (Gate 0) is its own judgment row (Upgrade 4: split outputs) — facts-only,
  // deterministic, and reported regardless of whether the asset is dormant/transactable.
  await insertJudgment(assetId, { dimension: "transactability", subDimension: "gate0", score: result.transactability,
    rationale: result.gate0.reasons.join(" "), flags: result.gate0.flags,
    modelVersion: "deterministic", promptVersion: SCORING_VERSION });

  // Record the engine (provider+model) so runs can be compared across models — NEVER the
  // apiKey. Copy exactly the two fields explicitly; never spread `cfg` into the payload.
  const engine = cfg ? { provider: cfg.provider, model: cfg.model } : null;
  await appendEvent("score_computed", assetId, { ...result, trace, shadow, divergence, engine });
  return { result, shadow, divergence };
}

export async function getLatestTrace(assetId: number): Promise<TraceEvent[] | null> {
  const last = [...(await getEvents(assetId))].reverse().find((e) => e.event_type === "score_computed");
  const payload = last?.payload as { trace?: TraceEvent[] } | undefined;
  return payload?.trace ?? null;
}
