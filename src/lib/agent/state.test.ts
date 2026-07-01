import { describe, it, expect } from "vitest";
import { computeDivergence, MAX_RESEARCH_ITERATIONS } from "./state";
import { config } from "@/lib/scoring/config";

describe("computeDivergence", () => {
  it("agrees when within threshold", () => {
    expect(computeDivergence(72, 80, config.shadowAgreeThreshold)).toEqual({ delta: 8, agree: true });
  });
  it("disagrees when beyond threshold", () => {
    expect(computeDivergence(40, 80, config.shadowAgreeThreshold)).toEqual({ delta: 40, agree: false });
  });
  it("treats a null deterministic score (gate failed) as 0 for the delta", () => {
    expect(computeDivergence(null, 10, config.shadowAgreeThreshold)).toEqual({ delta: 10, agree: true });
  });
});

describe("constants", () => {
  it("caps research iterations at 2", () => {
    expect(MAX_RESEARCH_ITERATIONS).toBe(2);
  });
});
