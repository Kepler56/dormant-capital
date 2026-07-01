// agent/graph.ts
// Why: wires the nodes into the reflective graph and exposes a streaming runner. The gate
// conditionally short-circuits to compose (guaranteeing VRFB passes without spending the deep
// tier), and critique loops back to research up to MAX_RESEARCH_ITERATIONS. runGraph yields
// each node's trace events as they happen (for SSE) and returns the final accumulated state.
import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, MAX_RESEARCH_ITERATIONS } from "./state";
import type { AgentDeps, AgentStateT, TraceEvent } from "./state";
import * as N from "./nodes";
import { extractJson } from "@/lib/llm/model";
import type { LLMConfig } from "@/lib/llm/config";
import { webEvidence } from "@/lib/llm/web-evidence";

export function defaultDeps(cfg?: LLMConfig | null): AgentDeps {
  // Both reasoning AND web search run on the user's own BYO provider — Gemini grounds via Google
  // Search, OpenAI via the Responses web_search tool, Anthropic via its web_search tool. No BYO
  // config ⇒ chat throws (surfaced as "configure your model") and search returns empty.
  return {
    chat: (tier, prompt, schema) => extractJson(tier, prompt, schema, cfg),
    search: (q) => webEvidence(q, cfg),
  };
}

// Node names must NOT collide with AgentState channel names (LangGraph forbids a node
// sharing a name with a state attribute), so several nodes are suffixed "_step" even
// though the underlying channel they populate (plan/gate/critique/shadow) has the bare name.
export function buildGraph(deps: AgentDeps) {
  const g = new StateGraph(AgentState)
    .addNode("plan_step", (s: AgentStateT) => N.planNode(s, deps))
    .addNode("research", (s: AgentStateT) => N.researchNode(s, deps))
    .addNode("extract_dormancy", (s: AgentStateT) => N.extractDormancyNode(s, deps))
    .addNode("gate_step", (s: AgentStateT) => N.gateNode(s))
    .addNode("extract_oppexec", (s: AgentStateT) => N.extractOppExecNode(s, deps))
    .addNode("critique_step", (s: AgentStateT) => N.critiqueNode(s, deps))
    .addNode("verify", (s: AgentStateT) => N.verifyNode(s, deps))
    .addNode("compose", (s: AgentStateT) => N.composeNode(s))
    .addNode("shadow_step", (s: AgentStateT) => N.shadowNode(s, deps));

  g.addEdge(START, "plan_step" as never);
  g.addEdge("plan_step" as never, "research" as never);
  g.addEdge("research" as never, "extract_dormancy" as never);
  g.addEdge("extract_dormancy" as never, "gate_step" as never);
  // Gate short-circuit: fail ⇒ straight to compose (no opp/exec, no critique loop).
  g.addConditionalEdges("gate_step" as never, (s: AgentStateT) => (s.gate?.passedGate ? "extract_oppexec" : "compose"),
    { extract_oppexec: "extract_oppexec", compose: "compose" } as never);
  g.addEdge("extract_oppexec" as never, "critique_step" as never);
  // Critique loop: fillable gaps + budget ⇒ re-research, else verify.
  g.addConditionalEdges("critique_step" as never, (s: AgentStateT) => {
    const loop = !!s.critique?.fillable && (s.critique?.queries.length ?? 0) > 0 && s.iteration < MAX_RESEARCH_ITERATIONS;
    return loop ? "research" : "verify";
  }, { research: "research", verify: "verify" } as never);
  g.addEdge("verify" as never, "compose" as never);
  // After deterministic compose (when gate passed), run the shadow scorer; else end.
  g.addConditionalEdges("compose" as never, (s: AgentStateT) => (s.gate?.passedGate ? "shadow_step" : END),
    { shadow_step: "shadow_step", [END]: END } as never);
  g.addEdge("shadow_step" as never, END);
  return g.compile();
}

export async function* runGraph(
  input: { assetId: number; num: string; patent: AgentStateT["patent"] },
  deps: AgentDeps
): AsyncGenerator<TraceEvent, AgentStateT, void> {
  const graph = buildGraph(deps);
  let final: AgentStateT | undefined;
  // streamMode "values" emits the full accumulated state after each node; we diff the trace.
  let emitted = 0;
  for await (const state of await graph.stream(
    { assetId: input.assetId, num: input.num, patent: input.patent },
    { streamMode: "values" }
  )) {
    final = state as AgentStateT;
    const trace = final.trace ?? [];
    for (; emitted < trace.length; emitted++) yield trace[emitted];
  }
  return final as AgentStateT;
}
