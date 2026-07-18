// Why: researchNode is where a broken grounding setup becomes either visible or invisible to
// the user. Before `status`, a search that never ran was traced as `ok / "0 sources"` — identical
// to a search that ran and found nothing — so an engine that could not ground AT ALL produced a
// clean-looking run whose every judgment was secretly ungrounded. These tests pin the reporting
// contract, because it is the only thing standing between an honest low-confidence verdict and a
// confident-looking fabricated one.
import { describe, it, expect } from "vitest";
import { researchNode } from "./nodes";
import type { AgentDeps, AgentStateT } from "./state";
import { MAX_WEB_SEARCHES } from "./state";
import type { WebEvidence } from "@/lib/llm/web-evidence";

const okResult = (q: string): WebEvidence => ({
  sources: [{ title: "S", url: `https://x/${q}`, snippet: "snip" }],
  text: "[1] S",
  status: "ok",
});
const emptyResult = (): WebEvidence => ({ sources: [], text: "(no web results found)", status: "empty" });
const failedResult = (error: string): WebEvidence => ({
  sources: [], text: "(web search failed — evidence unavailable)", status: "failed", error,
});

const deps = (search: AgentDeps["search"]): AgentDeps =>
  ({ search, chat: (async () => { throw new Error("chat not used by researchNode"); }) as AgentDeps["chat"] });

// Minimal state: researchNode reads iteration/plan/critique/searchCount only.
const state = (queries: string[]): AgentStateT =>
  ({ iteration: 0, searchCount: 0, plan: queries.map((q) => ({ dimension: "dormancy", question: q, query: q })) }) as AgentStateT;

describe("researchNode failure reporting", () => {
  it("traces a failed search as a warning naming the cause, never as '0 sources'", async () => {
    const out = await researchNode(state(["a"]), deps(async () => failedResult("gemini/bad-model: 404 not found")));
    const t = out.trace!.find((e) => e.label.includes("a"))!;
    expect(t.status).toBe("warn");
    expect(t.label).toContain("FAILED");
    expect(t.detail).toContain("bad-model");
    // The old, dangerous rendering must not appear anywhere in the trace.
    expect(out.trace!.some((e) => e.detail === "0 sources")).toBe(false);
  });

  it("still reports a genuinely empty-but-successful search as ok with 0 sources", async () => {
    const out = await researchNode(state(["a"]), deps(async () => emptyResult()));
    const t = out.trace!.find((e) => e.label.includes("a"))!;
    expect(t.status).toBe("ok");
    expect(t.detail).toBe("0 sources");
    expect(out.trace!.some((e) => e.status === "warn")).toBe(false);
  });

  it("raises a single explicit warning when EVERY search fails", async () => {
    const out = await researchNode(state(["a", "b", "c"]), deps(async () => failedResult("boom")));
    const banner = out.trace!.find((e) => e.label.includes("Web search unavailable"))!;
    expect(banner).toBeDefined();
    expect(banner.status).toBe("warn");
    expect(banner.detail).toContain("ungrounded");
  });

  it("does not raise the all-failed banner when at least one search succeeded", async () => {
    let n = 0;
    const out = await researchNode(state(["a", "b"]), deps(async (q) => (n++ === 0 ? failedResult("boom") : okResult(q))));
    expect(out.trace!.some((e) => e.label.includes("Web search unavailable"))).toBe(false);
    expect(out.sources).toHaveLength(1);
  });

  it("keeps sources from successful searches when others fail", async () => {
    let n = 0;
    const out = await researchNode(state(["a", "b"]), deps(async (q) => (n++ === 0 ? okResult(q) : failedResult("boom"))));
    expect(out.sources).toHaveLength(1);
    expect(out.searchCount).toBe(2); // budget is consumed by attempts, not by successes
  });

  it("reports the search budget as a delta so the global cap can accumulate across passes", async () => {
    // searchCount is a summing channel; returning the pass delta (not the total) is what lets
    // MAX_WEB_SEARCHES bound a whole run rather than a single pass.
    const s = { ...state(["a", "b"]), searchCount: MAX_WEB_SEARCHES - 1 } as AgentStateT;
    const out = await researchNode(s, deps(async (q) => okResult(q)));
    expect(out.searchCount).toBe(1);
  });
});
