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
