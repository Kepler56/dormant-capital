import { describe, it, expect } from "vitest";
import { buyerFitScore } from "./buyer-fit";
import type { BuyerFitEvidence } from "@/lib/types";

const ev = (value: string, snippet = ""): { value: string; snippet: string; confidence: "low" | "medium" | "high" } =>
  ({ value, snippet, confidence: "high" });

describe("buyerFitScore (deterministic mapper)", () => {
  it("high thesis alignment, no blocking mismatch -> 85", () => {
    const e: BuyerFitEvidence = { thesis_alignment: ev("high"), blocking_mismatch: ev("no") };
    const r = buyerFitScore(e);
    expect(r.score).toBe(85);
  });

  it("medium thesis alignment -> 55", () => {
    const e: BuyerFitEvidence = { thesis_alignment: ev("medium"), blocking_mismatch: ev("no") };
    expect(buyerFitScore(e).score).toBe(55);
  });

  it("high alignment but blocking mismatch yes -> capped at 20 with a blocking reason", () => {
    const e: BuyerFitEvidence = {
      thesis_alignment: ev("high"),
      blocking_mismatch: ev("yes", "wrong jurisdiction: EU-only filing"),
    };
    const r = buyerFitScore(e);
    expect(r.score).toBe(20);
    expect(r.reasons.some((x) => x.includes("Blocking mismatch") && x.includes("wrong jurisdiction: EU-only filing"))).toBe(true);
  });

  it("low alignment value -> 20", () => {
    const e: BuyerFitEvidence = { thesis_alignment: ev("low"), blocking_mismatch: ev("no") };
    expect(buyerFitScore(e).score).toBe(20);
  });

  it("unknown/unexpected alignment value defaults to low -> 20", () => {
    const e: BuyerFitEvidence = { thesis_alignment: ev("unknown"), blocking_mismatch: ev("unknown") };
    expect(buyerFitScore(e).score).toBe(20);
  });
});
