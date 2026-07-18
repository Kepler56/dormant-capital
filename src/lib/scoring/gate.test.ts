import { describe, it, expect } from "vitest";
import { dormancyGate } from "./gate";
import type { ParsedPatent, DormancyResidual } from "@/lib/types";

const base: ParsedPatent = {
  patentNumber: "US1", title: null, abstract: null, assignee: null, inventors: [],
  filingDate: null, grantDate: null, priorityDate: null, expiryDate: null,
  cpcClasses: [], forwardCitations: null, backwardCitations: null,
  legalEvents: [], maintenanceLapsed: false, anticipatedExpiration: false,
};
const NOW = new Date("2026-07-13");
const ev = (value: string) => ({ value, snippet: "", confidence: "high" as const });
const residual = (product: string, dev: string, lit: string): DormancyResidual =>
  ({ product_exists: ev(product), active_development: ev(dev), active_litigation: ev(lit) });

describe("dormancyGate (scoring-v2)", () => {
  it("fresh bare lapse stays at 75 and passes the gate", () => {
    const p = { ...base, maintenanceLapsed: true };
    const r = dormancyGate(p, undefined, NOW);
    expect(r.dormancyScore).toBe(75);
    expect(r.passedGate).toBe(true);
  });
  it("stale lapse (>2y, unreinstated) adds the stale bonus -> 83", () => {
    const p = { ...base, maintenanceLapsed: true, legalEvents: [
      { date: "2020-01-01", code: "EXP.", description: "Expired for failure to pay" },
    ]};
    expect(dormancyGate(p, undefined, NOW).dormancyScore).toBe(83);
  });
  it("stale lapse + both residuals confirmed reaches 100 (clamped)", () => {
    const p = { ...base, maintenanceLapsed: true, legalEvents: [
      { date: "2020-01-01", code: "EXP.", description: "Expired for failure to pay" },
    ]};
    // 20 + 55 + 8 + 12 + 10 = 105 -> 100
    expect(dormancyGate(p, residual("no", "no", "no"), NOW).dormancyScore).toBe(100);
  });
  it("maintained patent can never clear the floor even with residuals", () => {
    // 20 + 12 + 10 = 42 would exceed the floor — residual lift alone must NOT open the gate.
    const r = dormancyGate(base, residual("no", "no", "no"), NOW);
    expect(r.passedGate).toBe(false);
  });
  it("active litigation slashes decisively", () => {
    const p = { ...base, maintenanceLapsed: true };
    expect(dormancyGate(p, residual("unknown", "unknown", "yes"), NOW).dormancyScore).toBe(35);
  });
});

// The terms are what make the score explainable rather than asserted — the UI renders them as
// the visible arithmetic behind the number. If they ever stop summing to the score, the page
// shows a sum that doesn't add up, so that invariant is pinned here.
describe("dormancyGate score terms", () => {
  const stale = { ...base, maintenanceLapsed: true, legalEvents: [
    { date: "2020-01-01", code: "EXP.", description: "Expired for failure to pay" },
  ]};

  it("emits one term per contributing signal, summing to the score", () => {
    const r = dormancyGate(stale, undefined, NOW);
    expect(r.terms.map((t) => t.key)).toEqual(["base", "maintenanceLapsed", "staleLapse"]);
    expect(r.terms.map((t) => t.points)).toEqual([20, 55, 8]);
    expect(r.terms.reduce((n, t) => n + t.points, 0)).toBe(r.dormancyScore);
    expect(r.clamped).toBe(false);
  });

  it("marks the clamp when the raw sum exceeds 100, so the UI can explain the mismatch", () => {
    const r = dormancyGate(stale, residual("no", "no", "no"), NOW);
    expect(r.terms.reduce((n, t) => n + t.points, 0)).toBe(105);
    expect(r.dormancyScore).toBe(100);
    expect(r.clamped).toBe(true);
  });

  it("attributes each term to its origin so the UI can separate record facts from AI judgments", () => {
    const r = dormancyGate(stale, residual("no", "unknown", "unknown"), NOW);
    const byKey = Object.fromEntries(r.terms.map((t) => [t.key, t.origin]));
    expect(byKey.base).toBe("baseline");
    expect(byKey.maintenanceLapsed).toBe("uspto_record");
    expect(byKey.staleLapse).toBe("uspto_record");
    expect(byKey.noProduct).toBe("llm");
  });

  it("emits a negative term for litigation rather than hiding it in the total", () => {
    const r = dormancyGate({ ...base, maintenanceLapsed: true }, residual("unknown", "unknown", "yes"), NOW);
    const lit = r.terms.find((t) => t.key === "activeLitigation")!;
    expect(lit.points).toBeLessThan(0);
    expect(r.terms.reduce((n, t) => n + t.points, 0)).toBe(r.dormancyScore);
  });

  it("a patent with no signals shows only the baseline term", () => {
    const r = dormancyGate(base, undefined, NOW);
    expect(r.terms).toHaveLength(1);
    expect(r.terms[0].key).toBe("base");
    expect(r.passedGate).toBe(false);
  });
});
