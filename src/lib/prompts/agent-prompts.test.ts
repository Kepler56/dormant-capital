import { describe, it, expect } from "vitest";
import { buildPlanPrompt, PLAN_SCHEMA } from "./research-plan";
import { buildCritiquePrompt, CRITIQUE_SCHEMA } from "./critique";
import { buildVerifyPrompt, VERIFY_SCHEMA } from "./verify";
import { buildShadowPrompt, SHADOW_SCHEMA } from "./shadow-score";
import type { ParsedPatent } from "@/lib/types";

const patent: ParsedPatent = {
  patentNumber: "US1234567", title: "Widget", abstract: "An abstract", assignee: "Acme",
  inventors: [], filingDate: null, grantDate: null, priorityDate: null, expiryDate: null,
  cpcClasses: ["H01M"], forwardCitations: null, backwardCitations: null, legalEvents: [],
  maintenanceLapsed: true, anticipatedExpiration: false,
};

describe("prompt builders include the patent context", () => {
  it("plan prompt mentions title and assignee", () => {
    const p = buildPlanPrompt(patent);
    expect(p).toContain("Widget");
    expect(p).toContain("Acme");
  });
  it("verify prompt includes the claim and sources", () => {
    const p = buildVerifyPrompt({ claim: "no product exists", sources: "[1] foo" });
    expect(p).toContain("no product exists");
    expect(p).toContain("[1] foo");
  });
});

describe("schemas validate expected shapes", () => {
  it("PLAN_SCHEMA accepts items", () => {
    expect(PLAN_SCHEMA.safeParse({ items: [{ dimension: "dormancy", question: "q", query: "s" }] }).success).toBe(true);
  });
  it("CRITIQUE_SCHEMA accepts a gap list", () => {
    expect(CRITIQUE_SCHEMA.safeParse({ gaps: ["x"], fillable: true, queries: ["y"] }).success).toBe(true);
  });
  it("VERIFY_SCHEMA accepts a verdict", () => {
    expect(VERIFY_SCHEMA.safeParse({ supported: false, note: "n" }).success).toBe(true);
  });
  it("SHADOW_SCHEMA accepts a shadow score", () => {
    expect(SHADOW_SCHEMA.safeParse({ composite: 55, verdict: "WATCH", rationale: "r" }).success).toBe(true);
  });
  it("SHADOW_SCHEMA rejects an out-of-range composite", () => {
    expect(SHADOW_SCHEMA.safeParse({ composite: 999, verdict: "X", rationale: "r" }).success).toBe(false);
  });
});
