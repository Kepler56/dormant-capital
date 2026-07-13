import { describe, it, expect } from "vitest";
import { runGate0 } from "./gate0";
import type { ParsedPatent } from "@/lib/types";

const base: ParsedPatent = {
  patentNumber: "US1", title: null, abstract: null, assignee: null, inventors: [],
  filingDate: null, grantDate: null, priorityDate: null, expiryDate: null,
  cpcClasses: [], forwardCitations: null, backwardCitations: null,
  legalEvents: [], maintenanceLapsed: false, anticipatedExpiration: false,
};
const NOW = new Date("2026-07-13");

describe("runGate0", () => {
  it("full-term expiry -> PUBLIC_DOMAIN_INTEL, not transactable", () => {
    const r = runGate0({ ...base, anticipatedExpiration: true }, NOW);
    expect(r).toMatchObject({ legalStatus: "expired_term", route: "PUBLIC_DOMAIN_INTEL", transactable: "no", transactabilityScore: 15 });
    expect(r.reasons.join(" ")).toMatch(/public domain/i);
  });
  it("recent fee lapse -> REVIVAL, conditional, flagged for legal verification", () => {
    const p = { ...base, maintenanceLapsed: true, filingDate: "2015-01-01", legalEvents: [
      { date: "2025-06-01", code: "EXP.", description: "Expired for failure to pay" }] };
    const r = runGate0(p, NOW);
    expect(r).toMatchObject({ legalStatus: "expired_fee", route: "REVIVAL", transactable: "conditional", transactabilityScore: 55 });
    expect(r.flags).toContain("needs_legal_verification");
  });
  it("stale fee lapse -> REVIVAL with reduced score and extra flag", () => {
    const p = { ...base, maintenanceLapsed: true, filingDate: "2015-01-01", legalEvents: [
      { date: "2020-01-01", code: "EXP.", description: "Expired for failure to pay" }] };
    const r = runGate0(p, NOW);
    expect(r.transactabilityScore).toBe(35);
    expect(r.flags).toEqual(expect.arrayContaining(["needs_legal_verification", "stale_lapse_low_revival_odds"]));
  });
  it("fee lapse past natural term -> expired_term wins (nothing left to revive)", () => {
    const p = { ...base, maintenanceLapsed: true, filingDate: "2000-01-01" };
    expect(runGate0(p, NOW).legalStatus).toBe("expired_term");
  });
  it("in-force patent with enough term -> LICENSE_OR_ACQUIRE, transactable", () => {
    const p = { ...base, filingDate: "2018-01-01", grantDate: "2020-06-01" };
    const r = runGate0(p, NOW);
    expect(r).toMatchObject({ legalStatus: "active", route: "LICENSE_OR_ACQUIRE", transactable: "yes", transactabilityScore: 90 });
  });
  it("in-force but < minTermYears left -> still active, flagged short_term, reduced score", () => {
    const p = { ...base, filingDate: "2008-01-01", grantDate: "2011-03-01" }; // ~1.5y left
    const r = runGate0(p, NOW);
    expect(r.legalStatus).toBe("active");
    expect(r.flags).toContain("short_remaining_term");
    expect(r.transactabilityScore).toBeLessThan(90);
  });
  it("filed but never granted -> abandoned, TECH_INFO, not transactable", () => {
    // ~9y of nominal term from filing remain, but the abandoned branch precedes the
    // term check — an application without a grant has no subsisting rights to license.
    const p = { ...base, filingDate: "2015-01-01" };
    const r = runGate0(p, NOW);
    expect(r).toMatchObject({ legalStatus: "abandoned", route: "TECH_INFO", transactable: "no", transactabilityScore: 5 });
  });
  it("no usable facts -> unknown, needs_data flag", () => {
    const r = runGate0(base, NOW);
    expect(r).toMatchObject({ legalStatus: "unknown", route: "UNKNOWN", transactable: "conditional" });
    expect(r.flags).toContain("needs_data");
  });
});
