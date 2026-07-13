import { describe, it, expect } from "vitest";
import { yearsSinceLapse, yearsRemaining } from "./signals";
import type { ParsedPatent } from "@/lib/types";

const base: ParsedPatent = {
  patentNumber: "US1", title: null, abstract: null, assignee: null, inventors: [],
  filingDate: null, grantDate: null, priorityDate: null, expiryDate: null,
  cpcClasses: [], forwardCitations: null, backwardCitations: null,
  legalEvents: [], maintenanceLapsed: false, anticipatedExpiration: false,
};
const NOW = new Date("2026-07-13");

describe("yearsSinceLapse", () => {
  it("returns years since the most recent EXP event", () => {
    const p = { ...base, maintenanceLapsed: true, legalEvents: [
      { date: "2021-07-13", code: "EXP.", description: "Expired due to failure to pay maintenance fee" },
    ]};
    expect(yearsSinceLapse(p, NOW)).toBeCloseTo(5, 1);
  });
  it("returns null when there is no lapse event", () => {
    expect(yearsSinceLapse(base, NOW)).toBeNull();
  });
});

describe("yearsRemaining", () => {
  it("uses expiryDate when present", () => {
    expect(yearsRemaining({ ...base, expiryDate: "2031-07-13" }, NOW)).toBeCloseTo(5, 1);
  });
  it("falls back to filingDate + 20y", () => {
    expect(yearsRemaining({ ...base, filingDate: "2010-07-13" }, NOW)).toBeCloseTo(4, 1);
  });
  it("null when no dates", () => { expect(yearsRemaining(base, NOW)).toBeNull(); });
});
