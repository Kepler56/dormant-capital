import { describe, it, expect } from "vitest";
import { verdictFor } from "./verdict";
import { composeScore } from "./scoring/compose";
import type { ScoreResult } from "./scoring/compose";
import type { ParsedPatent } from "@/lib/types";

const base: ParsedPatent = {
  patentNumber: "US4786567", title: "All-vanadium redox battery", abstract: "…",
  assignee: "Pinnacle VRB", inventors: [], filingDate: "1986-08-04", grantDate: "1988-11-22",
  priorityDate: null, expiryDate: null, cpcClasses: [], forwardCitations: 120,
  backwardCitations: 5, legalEvents: [], maintenanceLapsed: false, anticipatedExpiration: true,
};

const noResidual = {
  product_exists: { value: "no" as const, snippet: "", confidence: "high" as const },
  active_development: { value: "no" as const, snippet: "", confidence: "high" as const },
  active_litigation: { value: "no" as const, snippet: "", confidence: "high" as const },
};

describe("verdictFor — Gate 0 route branching", () => {
  it("PUBLIC_DOMAIN_INTEL is presented as a product opportunity, not a dead end", () => {
    const r = composeScore(base, noResidual, undefined, new Date("2026-07-13"));
    expect(r.route).toBe("PUBLIC_DOMAIN_INTEL");
    const v = verdictFor(r);
    expect(v.headline).toMatch(/public domain/i);
    expect(v.headline).toMatch(/technology-intelligence product/i);
    expect(v.headline).not.toMatch(/still being maintained/i);
    expect(v.label).not.toBe("Still active");
  });

  it("TECH_INFO (ungranted application) gets its own headline, not 'still active'", () => {
    const p: ParsedPatent = { ...base, anticipatedExpiration: false, grantDate: null, filingDate: "2015-01-01" };
    const r = composeScore(p, noResidual, undefined, new Date("2026-07-13"));
    expect(r.route).toBe("TECH_INFO");
    const v = verdictFor(r);
    expect(v.headline).toMatch(/application without subsisting rights/i);
    expect(v.label).not.toBe("Still active");
  });

  it("UNKNOWN + conditional gets a cautious variant, not 'still active'", () => {
    const p: ParsedPatent = { ...base, anticipatedExpiration: false, grantDate: null, filingDate: null };
    const r = composeScore(p, noResidual, undefined, new Date("2026-07-13"));
    expect(r.route).toBe("UNKNOWN");
    expect(r.gate0.transactable).toBe("conditional");
    const v = verdictFor(r);
    expect(v.headline).toMatch(/legal status unverified/i);
    expect(v.label).not.toBe("Still active");
  });

  it("REVIVAL that clears the dormancy gate gets the normal band verdict, no route override", () => {
    const lapsed = { ...base, maintenanceLapsed: true, anticipatedExpiration: false };
    const now = new Date("1995-01-01");
    const r = composeScore(lapsed, noResidual,
      { commercial_relevance: { value: "high", snippet: "", confidence: "medium" },
        claim_breadth: { value: "medium", snippet: "", confidence: "medium" },
        ownership_clarity: { value: "high", snippet: "", confidence: "high" } },
      now);
    expect(r.route).toBe("REVIVAL");
    expect(r.passedGate).toBe(true);
    const v = verdictFor(r);
    // Normal band-based verdict — untouched by the route branching added for Gate 0.
    expect(v.label).toBe("Strong opportunity");
    expect(v.headline).toMatch(/worth routing/i);
  });

  it("a genuinely still-maintained patent (no route field, legacy payload) keeps the original behaviour", () => {
    const legacy = { ...composeScore(base, noResidual, undefined, new Date("2026-07-13")) } as ScoreResult;
    // Simulate a pre-Gate-0 payload: no route/gate0 at all.
    // @ts-expect-error deliberately simulating an old payload shape
    delete legacy.route;
    // @ts-expect-error deliberately simulating an old payload shape
    delete legacy.gate0;
    legacy.passedGate = false;
    const v = verdictFor(legacy);
    expect(v.label).toBe("Still active");
    expect(v.headline).toMatch(/still being maintained/i);
  });
});
