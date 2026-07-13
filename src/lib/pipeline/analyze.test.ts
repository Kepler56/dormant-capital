import { describe, it, expect, beforeEach } from "vitest";
import { runAnalysis } from "./analyze";
import type { AgentDeps } from "@/lib/agent/state";
import { upsertAsset, insertFact, getJudgments, getEvents } from "@/lib/db/queries";

function fakeDeps(): AgentDeps {
  return {
    search: async () => ({ sources: [{ title: "S", url: "http://x", snippet: "s" }], text: "[1] S" }),
    chat: (async (_t: string, prompt: string) => {
      if (prompt.includes("planning research")) return { data: { items: [{ dimension: "dormancy", question: "q", query: "s" }] }, model: "fake" };
      if (prompt.includes("still alive")) return { data: { product_exists: { value: "no", snippet: "", confidence: "high" }, active_development: { value: "no", snippet: "", confidence: "low" }, active_litigation: { value: "no", snippet: "", confidence: "low" } }, model: "fake" };
      if (prompt.includes("Critique")) return { data: { gaps: [], fillable: false, queries: [] }, model: "fake" };
      if (prompt.includes("genuinely support")) return { data: { supported: true, note: "n" }, model: "fake" };
      if (prompt.includes("autonomous patent analyst")) return { data: { composite: 70, verdict: "ROUTE", rationale: "r" }, model: "fake" };
      return { data: { commercial_relevance: { value: "high", snippet: "", confidence: "high" }, claim_breadth: { value: "high", snippet: "", confidence: "high" }, ownership_clarity: { value: "high", snippet: "", confidence: "high" } }, model: "fake" };
    }) as AgentDeps["chat"],
  };
}

async function run(id: number, num: string, deps: AgentDeps) {
  const gen = runAnalysis(id, num, null, deps);
  const events = [];
  let r = await gen.next();
  while (!r.done) { events.push(r.value); r = await gen.next(); }
  return { events, result: r.value };
}

describe("runAnalysis", () => {
  let id: number;
  beforeEach(async () => {
    id = await upsertAsset("US-TESTLAPSED-" + Math.floor(performance.now()));
    await insertFact(id, { key: "maintenance_lapsed", value: true, source: "test", sourceUrl: "", retrievedAt: "2026-01-01" });
    await insertFact(id, { key: "title", value: "Test", source: "test", sourceUrl: "", retrievedAt: "2026-01-01" });
  });

  it("streams trace events and persists judgments incl. shadow and transactability", async () => {
    const { events, result } = await run(id, "US-TESTLAPSED", fakeDeps());
    expect(events.length).toBeGreaterThan(3);
    expect(result.result.passedGate).toBe(true);
    expect(result.shadow?.composite).toBe(70);
    const judgments = await getJudgments(id);
    const dims = judgments.map((j) => j.dimension);
    expect(dims).toContain("dormancy");
    expect(dims).toContain("shadow");
    expect(dims).toContain("transactability");
    const transactability = judgments.find((j) => j.dimension === "transactability");
    expect(transactability?.sub_dimension).toBe("gate0");
    expect(transactability?.score).toBe(result.result.transactability);
    expect(transactability?.model_version).toBe("deterministic");
  });

  it("records engine (provider+model) on the score_computed event, never the apiKey", async () => {
    const cfg = { provider: "anthropic" as const, model: "claude-x", apiKey: "sk-secret-should-never-leak" };
    await run(id, "US-TESTLAPSED", fakeDeps());
    // runAnalysis(cfg) path: re-run with cfg to exercise the engine field (deps still injected,
    // so no real network/LLM call is made — cfg is only read for its provider/model here).
    const gen = runAnalysis(id, "US-TESTLAPSED", cfg, fakeDeps());
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    const scoreEvents = (await getEvents(id)).filter((e) => e.event_type === "score_computed");
    const last = scoreEvents[scoreEvents.length - 1];
    const payload = last.payload as { engine?: { provider: string; model: string } | null };
    expect(payload.engine).toEqual({ provider: "anthropic", model: "claude-x" });
    expect(JSON.stringify(payload)).not.toContain("sk-secret-should-never-leak");
  });

  it("records engine: null when no BYO config is provided", async () => {
    await run(id, "US-TESTLAPSED", fakeDeps());
    const scoreEvents = (await getEvents(id)).filter((e) => e.event_type === "score_computed");
    const last = scoreEvents[scoreEvents.length - 1];
    const payload = last.payload as { engine?: unknown };
    expect(payload.engine).toBeNull();
  });
});
