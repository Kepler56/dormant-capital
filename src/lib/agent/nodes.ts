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
  const collected: { sources: WebSource[] } = { sources: [] };
  for (const q of queries) {
    const r = await deps.search(q);
    collected.sources.push(...r.sources);
    trace.push(ev("research", `Searched: ${q}`, "ok", `${r.sources.length} sources`));
  }
  if (planned.length > queries.length) {
    trace.push(ev("research", `Search budget reached (max ${MAX_WEB_SEARCHES}) — skipped ${planned.length - queries.length} query(ies)`, "info"));
  }
  return {
    sources: collected.sources,
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
  return {
    gate,
    trace: [ev("gate", gate.passedGate ? "Dormancy gate PASSED — proceeding" : "Dormancy gate FAILED — not dormant", gate.passedGate ? "ok" : "info", `score ${gate.dormancyScore}`)],
  };
}

export async function extractOppExecNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  const { data, model } = await deps.chat("deep",
    buildOppExecPrompt({ title: s.patent.title ?? s.num, abstract: s.patent.abstract ?? "", assignee: s.patent.assignee ?? "unknown", cpc: s.patent.cpcClasses.join(", ") }),
    OppExecEvidence);
  return { oppExec: data, oppExecModel: model, trace: [ev("extract_oppexec", "Extracted opportunity & execution evidence", "ok")] };
}

export async function critiqueNode(s: AgentStateT, deps: AgentDeps): Promise<Partial<AgentStateT>> {
  const evidenceJson = JSON.stringify({ dormancy: s.dormancy, oppExec: s.oppExec });
  const { data } = await deps.chat("extract", buildCritiquePrompt({ evidenceJson, sources: s.sourceText }), CRITIQUE_SCHEMA);
  const willLoop = data.fillable && data.queries.length > 0 && s.iteration < MAX_RESEARCH_ITERATIONS;
  return {
    critique: data,
    trace: [ev("critique", data.gaps.length ? `Found ${data.gaps.length} gap(s)` : "No gaps — evidence is solid", data.gaps.length ? "warn" : "ok", willLoop ? "re-searching" : undefined)],
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
