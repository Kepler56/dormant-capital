// agent/state.ts
// Why: the shared vocabulary of the agent — the LangGraph state channels, the trace-event
// shape that streams to the UI, the shadow-score/divergence types, and the injected deps
// (chat + search) that make every node pure and testable. Keeping the annotation here means
// nodes.ts and graph.ts agree on one state contract.
import { Annotation } from "@langchain/langgraph";
import type { ZodSchema } from "zod";
import type { Tier } from "@/lib/llm/model";
import type { WebSource, WebEvidence } from "@/lib/llm/web-evidence";
import type { DormancyResidual, OppExecEvidence, ParsedPatent } from "@/lib/types";
import type { ScoreResult } from "@/lib/scoring/compose";
import type { GateResult } from "@/lib/scoring/gate";

// One research pass keeps the whole run inside a serverless time budget (a second critique-driven
// pass roughly doubled wall-clock for a marginal evidence gain).
export const MAX_RESEARCH_ITERATIONS = 1;
// Hard ceiling on the number of web searches across a whole analysis. Searches in a pass run in
// PARALLEL (see researchNode), so this also bounds fan-out. Kept small for latency on any provider.
export const MAX_WEB_SEARCHES = 4;

export type TraceEvent = {
  step: string;
  label: string;
  status: "start" | "ok" | "warn" | "info";
  detail?: string;
  ts?: number;
};

export type ShadowScore = { composite: number; verdict: string; rationale: string };
export type Divergence = { delta: number; agree: boolean };

export type PlanItem = { dimension: "dormancy" | "opportunity" | "execution"; question: string; query: string };
export type Critique = { gaps: string[]; fillable: boolean; queries: string[] };

export type AgentDeps = {
  chat: <T>(tier: Tier, prompt: string, schema: ZodSchema<T>) => Promise<{ data: T; model: string }>;
  // Returns the full WebEvidence — `status`/`error` included — so researchNode can report a
  // failed search as a failure instead of as an empty result. See web-evidence.ts.
  search: (query: string) => Promise<WebEvidence>;
};

export function computeDivergence(deterministic: number | null, shadow: number, threshold: number): Divergence {
  const delta = Math.abs((deterministic ?? 0) - shadow);
  return { delta, agree: delta <= threshold };
}

const appendReducer = <T>() => ({ reducer: (a: T[], b: T[]) => a.concat(b), default: (): T[] => [] });

export const AgentState = Annotation.Root({
  assetId: Annotation<number>(),
  num: Annotation<string>(),
  patent: Annotation<ParsedPatent>(),
  plan: Annotation<PlanItem[]>({ reducer: (_a, b) => b, default: () => [] }),
  sources: Annotation<WebSource[]>(appendReducer<WebSource>()),
  sourceText: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  dormancy: Annotation<DormancyResidual | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  dormancyModel: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  oppExec: Annotation<OppExecEvidence | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  oppExecModel: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  gate: Annotation<GateResult | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  critique: Annotation<Critique | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  iteration: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  searchCount: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  result: Annotation<ScoreResult | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  shadow: Annotation<ShadowScore | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  shadowModel: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  divergence: Annotation<Divergence | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  trace: Annotation<TraceEvent[]>(appendReducer<TraceEvent>()),
});

export type AgentStateT = typeof AgentState.State;
