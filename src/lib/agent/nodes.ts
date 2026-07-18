// agent/nodes.ts
// Why: each node does ONE step of the agentic workflow and returns a partial state update
// plus a trace event. Nodes are pure over injected deps (chat + search) so the whole graph is
// testable without network or API keys. The gate and compose nodes call the SAME deterministic
// functions the old pipeline used — the score stays code-decided; the agent only enriches and
// verifies the evidence that feeds it.
import type { AgentDeps, AgentStateT, TraceEvent, ShadowScore } from "./state";
import { MAX_RESEARCH_ITERATIONS, MAX_WEB_SEARCHES, computeDivergence } from "./state";
import { config } from "@/lib/scoring/config";
import { dormancyGate } from "@/lib/scoring/gate";
import { runGate0 } from "@/lib/scoring/gate0";
import { composeScore } from "@/lib/scoring/compose";
import { DormancyResidual, OppExecEvidence } from "@/lib/types";
import { buildDormancyPrompt } from "@/lib/prompts/dormancy-residual";
import { buildOppExecPrompt } from "@/lib/prompts/opportunity-execution";
import { buildPlanPrompt, PLAN_SCHEMA } from "@/lib/prompts/research-plan";
import { buildCritiquePrompt, CRITIQUE_SCHEMA } from "@/lib/prompts/critique";
import { buildVerifyPrompt, VERIFY_SCHEMA } from "@/lib/prompts/verify";
import { buildShadowPrompt, SHADOW_SCHEMA } from "@/lib/prompts/shadow-score";
import type { WebSource } from "@/lib/llm/web-evidence";

const ev = (step: string, label: string, status: TraceEvent["status"], detail?: string): TraceEvent =>
  ({ step, label, status, detail });

export async function planNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  const { data } = await deps.chat("screen", buildPlanPrompt(s.patent), PLAN_SCHEMA);
  return { plan: data.items, trace: [ev("plan", `Planned ${data.items.length} research questions`, "ok")] };
}

export async function researchNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  // Run planned queries (first pass) OR critique follow-up queries (later passes).
  const planned = s.iteration === 0
    ? s.plan.map((i) => i.query)
    : (s.critique?.queries ?? []);
  // Enforce the global search budget: never exceed MAX_WEB_SEARCHES across the whole run, and
  // at most 4 per pass.
  const budget = Math.max(0, MAX_WEB_SEARCHES - s.searchCount);
  const queries = planned.slice(0, Math.min(4, budget));
  const trace: TraceEvent[] = [];
  // Run the pass's searches in PARALLEL — wall-clock is the slowest single search, not the sum.
  const results = await Promise.all(queries.map((q) => deps.search(q).then((r) => ({ q, r }))));
  const sources: WebSource[] = [];
  let failures = 0;
  for (const { q, r } of results) {
    sources.push(...r.sources);
    // A failed search is reported as a WARNING naming the cause, not as a successful "0 sources".
    // Reading a run's trace must make it obvious whether the evidence base is thin because the
    // web is quiet or because grounding never ran.
    if (r.status === "failed") {
      failures++;
      trace.push(ev("research", `Search FAILED: ${q}`, "warn", r.error ?? "unknown error"));
    } else {
      trace.push(ev("research", `Searched: ${q}`, "ok", `${r.sources.length} sources`));
    }
  }
  // Every query failing means this engine cannot ground at all — the single most important thing
  // to know about the run, since every downstream judgment is then model prior with no evidence
  // behind it. Called out once, explicitly, rather than left for the reader to infer from N warns.
  if (failures > 0 && failures === queries.length) {
    trace.push(ev("research", `Web search unavailable for this engine — all ${failures} search(es) failed`, "warn",
      "Findings below are ungrounded (model prior only). Check the engine's model id supports web search."));
  }
  if (planned.length > queries.length) {
    trace.push(ev("research", `Search budget reached (max ${MAX_WEB_SEARCHES}) — skipped ${planned.length - queries.length} query(ies)`, "info"));
  }
  return {
    sources,
    searchCount: queries.length,
    iteration: s.iteration + 1,
    trace,
  };
}

// Build the numbered source block from accumulated sources (dedup by url).
function sourceText(sources: { title: string; url: string; snippet: string }[]): string {
  const seen = new Set<string>();
  const uniq = sources.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
  return uniq.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet || "(no snippet)"}`).join("\n\n");
}

export async function extractDormancyNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  const text = sourceText(s.sources);
  const { data, model } = await deps.chat("extract",
    buildDormancyPrompt({ title: s.patent.title ?? s.num, abstract: s.patent.abstract ?? "", assignee: s.patent.assignee ?? "unknown", webEvidence: text }),
    DormancyResidual);
  return { dormancy: data, dormancyModel: model, sourceText: text, trace: [ev("extract_dormancy", "Extracted dormancy evidence", "ok")] };
}

export function gateNode(s: AgentStateT): Partial<AgentStateT> {
  const gate = dormancyGate(s.patent, s.dormancy);
  // Gate 0 (facts-only transactability) runs alongside the dormancy gate. When Gate 0 says
  // "no" (e.g. full-term expiry), the asset is not transactable at all, so no LLM tokens
  // should be spent extracting opportunity/execution evidence for it — reuse the SAME
  // passedGate:false short-circuit the dormancy gate already drives (straight to compose);
  // do not add a new conditional edge.
  const g0 = runGate0(s.patent);
  if (g0.transactable === "no") {
    return {
      gate: { ...gate, passedGate: false },
      trace: [ev("gate", `Gate 0: ${g0.route} — skipping opportunity/execution analysis`, "info", g0.reasons[0])],
    };
  }
  return {
    gate,
    trace: [ev("gate", gate.passedGate ? "Dormancy gate PASSED — proceeding" : "Dormancy gate FAILED — not dormant", gate.passedGate ? "ok" : "info", `score ${gate.dormancyScore}`)],
  };
}

export async function extractOppExecNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  // s.sourceText is the same numbered evidence block the dormancy extractor saw. Passing it here
  // is what makes opportunity/execution grounded: the research plan spends part of its query
  // budget on exactly these two dimensions, and until now those results reached no prompt at all.
  const grounded = s.sourceText.length > 0;
  const { data, model } = await deps.chat("deep",
    buildOppExecPrompt({
      title: s.patent.title ?? s.num,
      abstract: s.patent.abstract ?? "",
      assignee: s.patent.assignee ?? "unknown",
      cpc: s.patent.cpcClasses.join(", "),
      webEvidence: s.sourceText,
    }),
    OppExecEvidence);
  return {
    oppExec: data,
    oppExecModel: model,
    trace: [ev("extract_oppexec",
      grounded ? "Extracted opportunity & execution evidence" : "Extracted opportunity & execution evidence (ungrounded)",
      grounded ? "ok" : "warn",
      grounded ? `${s.sources.length} source(s)` : "no web evidence — bands are model prior only")],
  };
}

export async function critiqueNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  const evidenceJson = JSON.stringify({ dormancy: s.dormancy, oppExec: s.oppExec });
  const { data } = await deps.chat("extract", buildCritiquePrompt({ evidenceJson, sources: s.sourceText }), CRITIQUE_SCHEMA);
  const willLoop = data.fillable && data.queries.length > 0 && s.iteration < MAX_RESEARCH_ITERATIONS;
  // MAX_RESEARCH_ITERATIONS is 1 by design (a second pass roughly doubles wall-clock), so
  // `willLoop` is currently always false and the follow-up queries are never run. The gaps are
  // still worth the call: they are the honest list of what this analysis could NOT establish, so
  // they are named in the trace rather than reduced to a count. A reader can then see that e.g.
  // "no evidence found about current licensing" is a known hole, not an unasked question.
  return {
    critique: data,
    trace: [ev(
      "critique",
      data.gaps.length ? `Could not establish ${data.gaps.length} thing(s)` : "No gaps — evidence is solid",
      data.gaps.length ? "warn" : "ok",
      data.gaps.length ? data.gaps.join(" · ") : undefined,
    )],
  };
}

export async function verifyNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  // Verify the single most material dormancy claim against sources. If unsupported, downgrade
  // it to 'unknown' so it cannot influence the deterministic gate.
  const trace: TraceEvent[] = [];
  let dormancy = s.dormancy;
  if (dormancy && dormancy.product_exists.value === "no") {
    const { data } = await deps.chat("extract",
      buildVerifyPrompt({ claim: "No current product practicing this invention exists", sources: s.sourceText }), VERIFY_SCHEMA);
    if (!data.supported) {
      dormancy = { ...dormancy, product_exists: { ...dormancy.product_exists, value: "unknown", confidence: "low" } };
      trace.push(ev("verify", "Claim 'no product' NOT supported — downgraded to unknown", "warn"));
    } else {
      trace.push(ev("verify", "Verified: 'no product' is supported by sources", "ok"));
    }
  } else {
    trace.push(ev("verify", "No high-impact claim required verification", "info"));
  }
  return { dormancy, trace };
}

export function composeNode(s: AgentStateT): Partial<AgentStateT> {
  const result = composeScore(s.patent, s.dormancy, s.oppExec);
  return { result, trace: [ev("compose", `Deterministic score composed: ${result.band}`, "ok", result.composite != null ? `composite ${result.composite}` : `dormancy ${result.dormancy}`)] };
}

export async function shadowNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  const { data, model } = await deps.chat("deep",
    buildShadowPrompt({ patentJson: JSON.stringify({ title: s.patent.title, assignee: s.patent.assignee, cpc: s.patent.cpcClasses }), evidenceJson: JSON.stringify({ dormancy: s.dormancy, oppExec: s.oppExec }) }),
    SHADOW_SCHEMA);
  const shadow: ShadowScore = data;
  const divergence = computeDivergence(s.result?.composite ?? null, shadow.composite, config.shadowAgreeThreshold);
  return {
    shadow, shadowModel: model, divergence,
    trace: [ev("shadow", `Shadow analyst scored ${shadow.composite} (${shadow.verdict})`, divergence.agree ? "ok" : "warn", divergence.agree ? "agrees with engine" : `differs by ${divergence.delta}`)],
  };
}
