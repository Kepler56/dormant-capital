import { describe, it, expect } from "vitest";
import { runGraph, defaultDeps } from "./graph";
import type { AgentDeps } from "./state";
import type { ParsedPatent } from "@/lib/types";

function patent(over: Partial<ParsedPatent> = {}): ParsedPatent {
  return {
    patentNumber: "US1", title: "T", abstract: "A", assignee: "Acme", inventors: [],
    filingDate: null, grantDate: null, priorityDate: null, expiryDate: null, cpcClasses: ["H01M"],
    forwardCitations: null, backwardCitations: null, legalEvents: [],
    maintenanceLapsed: true, anticipatedExpiration: false, ...over,
  };
}

// A fake deps that returns canned structured output per schema shape.
function fakeDeps(over: Partial<{ productExists: string; fillable: boolean }> = {}): AgentDeps {
  const productExists = over.productExists ?? "no";
  const fillable = over.fillable ?? false;
  return {
    search: async (q) => ({ sources: [{ title: "S", url: "http://x/" + q, snippet: "snip" }], text: "[1] S" }),
    chat: (async (_tier: string, prompt: string) => {
      if (prompt.includes("planning research")) return { data: { items: [{ dimension: "dormancy", question: "q", query: "s" }] }, model: "fake" };
      if (prompt.includes("still alive")) return { data: { product_exists: { value: productExists, snippet: "", confidence: "high" }, active_development: { value: "no", snippet: "", confidence: "low" }, active_litigation: { value: "no", snippet: "", confidence: "low" } }, model: "fake" };
      if (prompt.includes("Critique")) return { data: { gaps: fillable ? ["g"] : [], fillable, queries: fillable ? ["more"] : [] }, model: "fake" };
      if (prompt.includes("genuinely support")) return { data: { supported: true, note: "ok" }, model: "fake" };
      if (prompt.includes("autonomous patent analyst")) return { data: { composite: 72, verdict: "ROUTE", rationale: "r" }, model: "fake" };
      // opp/exec
      return { data: { commercial_relevance: { value: "high", snippet: "", confidence: "high" }, claim_breadth: { value: "medium", snippet: "", confidence: "medium" }, ownership_clarity: { value: "high", snippet: "", confidence: "high" } }, model: "fake" };
    }) as AgentDeps["chat"],
  };
}

async function drain(gen: AsyncGenerator<unknown, unknown, void>) {
  const events: unknown[] = [];
  let r = await gen.next();
  while (!r.done) { events.push(r.value); r = await gen.next(); }
  return { events, final: r.value as import("./state").AgentStateT };
}

describe("agent graph", () => {
  it("runs the full path and produces a deterministic result + shadow score", async () => {
    const { events, final } = await drain(runGraph({ assetId: 1, num: "US1", patent: patent() }, fakeDeps()));
    expect(events.length).toBeGreaterThan(4);
    expect(final.result?.passedGate).toBe(true);
    expect(final.shadow?.composite).toBe(72);
    expect(final.divergence).toBeDefined();
  });

  it("VRFB (maintained) fails the gate regardless of agent output", async () => {
    const vrfb = patent({ patentNumber: "US4786567", maintenanceLapsed: false });
    // Even if the LLM claims 'no product', the deterministic gate must keep it a PASS.
    const { final } = await drain(runGraph({ assetId: 2, num: "US4786567", patent: vrfb }, fakeDeps({ productExists: "no" })));
    expect(final.result?.passedGate).toBe(false);
    expect(final.result?.band).toBe("PASS");
    expect(final.shadow).toBeUndefined(); // shadow only runs when the gate passes
  });

  it("bounds the critique→research loop at 2 iterations", async () => {
    const { final } = await drain(runGraph({ assetId: 3, num: "US1", patent: patent() }, fakeDeps({ fillable: true })));
    expect(final.iteration).toBeLessThanOrEqual(2);
    expect(final.result).toBeDefined();
  });

  it("Gate 0 'no' (full-term expiry) short-circuits before opp/exec spend, even though the dormancy gate alone would pass", async () => {
    // filed 2000-01-01 + 20y term expired 2020 — well in the past regardless of "today".
    // Maintenance is ALSO lapsed, so the plain dormancy gate would pass (hero signal), but
    // Gate 0 must win: full-term expiry means there is no exclusivity left to sell.
    const expired = patent({ patentNumber: "US-EXPIRED", filingDate: "2000-01-01", grantDate: "2002-01-01", maintenanceLapsed: true, anticipatedExpiration: false });
    const { events, final } = await drain(runGraph({ assetId: 4, num: "US-EXPIRED", patent: expired }, fakeDeps()));
    expect(final.result?.route).toBe("PUBLIC_DOMAIN_INTEL");
    expect(final.result?.passedGate).toBe(false);
    expect(final.result?.band).toBe("PASS");
    expect(final.oppExec).toBeUndefined(); // extract_oppexec was skipped entirely
    expect(final.shadow).toBeUndefined(); // shadow only runs when the gate passed
    expect((events as import("./state").TraceEvent[]).some((e) => e.label.includes("Gate 0"))).toBe(true);
  });
});

describe("defaultDeps", () => {
  it("wires chat + search", () => {
    const d = defaultDeps(null);
    expect(typeof d.chat).toBe("function");
    expect(typeof d.search).toBe("function");
  });
});
