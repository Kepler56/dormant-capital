import { describe, it, expect, beforeEach } from "vitest";
import { runAnalysis } from "./analyze";
import type { AgentDeps } from "@/lib/agent/state";
import { upsertAsset, insertFact, getJudgments } from "@/lib/db/queries";

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
  beforeEach(() => {
    id = upsertAsset("US-TESTLAPSED-" + Math.floor(performance.now()));
    insertFact(id, { key: "maintenance_lapsed", value: true, source: "test", sourceUrl: "", retrievedAt: "2026-01-01" });
    insertFact(id, { key: "title", value: "Test", source: "test", sourceUrl: "", retrievedAt: "2026-01-01" });
  });

  it("streams trace events and persists judgments incl. shadow", async () => {
    const { events, result } = await run(id, "US-TESTLAPSED", fakeDeps());
    expect(events.length).toBeGreaterThan(3);
    expect(result.result.passedGate).toBe(true);
    expect(result.shadow?.composite).toBe(70);
    const dims = getJudgments(id).map((j) => j.dimension);
    expect(dims).toContain("dormancy");
    expect(dims).toContain("shadow");
  });
});
