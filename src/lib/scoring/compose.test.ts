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

  it("full-term-expired patent short-circuits at Gate 0 -> PUBLIC_DOMAIN_INTEL, no composite, even with strong residual/oppExec evidence", () => {
    // `base` has anticipatedExpiration: true. Gate 0 must win BEFORE the dormancy gate or
    // opportunity/execution get a chance to run — no meaning is spent scoring exclusivity
    // that no longer exists, regardless of how compelling the LLM evidence looks.
    const r = composeScore(base,
      { product_exists: { value: "no", snippet: "", confidence: "high" },
        active_development: { value: "no", snippet: "", confidence: "high" },
        active_litigation: { value: "no", snippet: "", confidence: "high" } },
      { commercial_relevance: { value: "high", snippet: "", confidence: "high" },
        claim_breadth: { value: "high", snippet: "", confidence: "high" },
        ownership_clarity: { value: "high", snippet: "", confidence: "high" } },
      new Date("2026-07-13"));
    expect(r.route).toBe("PUBLIC_DOMAIN_INTEL");
    expect(r.transactability).toBe(15);
    expect(r.band).toBe("PASS");
    expect(r.composite).toBeNull();
    expect(r.passedGate).toBe(false);
    expect(r.gate0.legalStatus).toBe("expired_term");
  });

  it("an abandoned, lapsed patent passes the gate and gets a composite band", () => {
    const lapsed = { ...base, maintenanceLapsed: true, anticipatedExpiration: false };
    // Fixed clock well inside the 1986-filed patent's 20-year term (expires 2006-08-04),
    // so Gate 0 sees the fee lapse as revivable rather than superseded by full-term expiry.
    const now = new Date("1995-01-01");
    const r = composeScore(lapsed,
      { product_exists: { value: "no", snippet: "", confidence: "high" },
        active_development: { value: "no", snippet: "", confidence: "high" },
        active_litigation: { value: "no", snippet: "", confidence: "high" } },
      { commercial_relevance: { value: "high", snippet: "", confidence: "medium" },
        claim_breadth: { value: "medium", snippet: "", confidence: "medium" },
        ownership_clarity: { value: "high", snippet: "", confidence: "high" } },
      now);
    // Gate 0: undated lapse (no legalEvents) + term still remaining -> REVIVAL, conditional.
    expect(r.route).toBe("REVIVAL");
    expect(r.transactability).toBe(55);
    expect(r.gate0.transactable).toBe("conditional");
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
