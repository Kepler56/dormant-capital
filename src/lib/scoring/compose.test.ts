import { describe, it, expect } from "vitest";
import { composeScore } from "./compose";
import type { ParsedPatent } from "@/lib/types";

const base: ParsedPatent = {
  patentNumber: "US4786567", title: "All-vanadium redox battery", abstract: "…",
  assignee: "Pinnacle VRB", inventors: [], filingDate: "1986-08-04", grantDate: "1988-11-22",
  priorityDate: null, expiryDate: null, cpcClasses: [], forwardCitations: 120,
  backwardCitations: 5, legalEvents: [], maintenanceLapsed: false, anticipatedExpiration: true,
};

describe("composeScore", () => {
  it("VRFB (actively developed, fees maintained) fails the gate -> PASS, data-first", () => {
    // Realistic VRFB evidence: a live product, ongoing development, NO litigation. The
    // gate must still return PASS purely because there is no maintenance-fee lapse — i.e.
    // the LLM's answers cannot open the gate without the hard abandonment signal.
    const r = composeScore(base, {
      product_exists: { value: "yes", snippet: "VRFB products on market", confidence: "high" },
      active_development: { value: "yes", snippet: "ongoing R&D", confidence: "high" },
      active_litigation: { value: "no", snippet: "", confidence: "low" },
    }, undefined);
    expect(r.passedGate).toBe(false);
    expect(r.band).toBe("PASS");
  });

  it("the LLM alone (no product + no development) cannot open the gate without a fee lapse", () => {
    // Even if the model claims abandonment, a maintained patent stays a PASS (data-first).
    const r = composeScore(base, {
      product_exists: { value: "no", snippet: "", confidence: "high" },
      active_development: { value: "no", snippet: "", confidence: "high" },
      active_litigation: { value: "no", snippet: "", confidence: "high" },
    }, undefined);
    expect(r.passedGate).toBe(false);
    expect(r.band).toBe("PASS");
  });

  it("an abandoned, lapsed patent passes the gate and gets a composite band", () => {
    const lapsed = { ...base, maintenanceLapsed: true, anticipatedExpiration: false };
    const r = composeScore(lapsed,
      { product_exists: { value: "no", snippet: "", confidence: "high" },
        active_development: { value: "no", snippet: "", confidence: "high" },
        active_litigation: { value: "no", snippet: "", confidence: "high" } },
      { commercial_relevance: { value: "high", snippet: "", confidence: "medium" },
        claim_breadth: { value: "medium", snippet: "", confidence: "medium" },
        ownership_clarity: { value: "high", snippet: "", confidence: "high" } });
    // dormancy: 20 + 55 (hero) + 12 (no product) + 10 (no development) = 97, no stale
    // bonus (no dated lapse event). opportunity: fc=120 -> citation 85;
    // round(0.5*85 + 0.3*85(high) + 0.2*55(medium)) = 79. execution: lapsed (not
    // expired) -> timeComponent 45; round(0.5*85(high ownership) + 0.5*45) = 65.
    // composite: round(0.4*97 + 0.35*79 + 0.25*65) = 83 -> >= route(70) -> ROUTE.
    expect(r.passedGate).toBe(true);
    expect(r.dormancy).toBe(97);
    expect(r.opportunity).toBe(79);
    expect(r.execution).toBe(65);
    expect(r.composite).toBe(83);
    expect(r.band).toBe("ROUTE");
  });
});
