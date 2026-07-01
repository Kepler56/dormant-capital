import { describe, it, expect } from "vitest";
import { selectSubset } from "./select";

describe("selectSubset", () => {
  const dormant = Array.from({ length: 100 }, (_, i) => String(1000 + i));
  const paid = Array.from({ length: 100 }, (_, i) => String(9000 + i));

  it("caps each pool and is deterministic across runs", () => {
    const a = selectSubset(dormant, paid, { dormantCap: 10, paidCap: 5, forceInclude: [] });
    const b = selectSubset(dormant, paid, { dormantCap: 10, paidCap: 5, forceInclude: [] });
    expect(a.size).toBe(15);
    expect([...a]).toEqual([...b]);          // reproducible
  });
  it("always includes forced numbers even if absent from pools", () => {
    const s = selectSubset(dormant, paid, { dormantCap: 10, paidCap: 5, forceInclude: ["4786567"] });
    expect(s.has("4786567")).toBe(true);
    expect(s.size).toBe(16);
  });
  it("returns the whole pool when cap exceeds pool size", () => {
    const s = selectSubset(dormant, [], { dormantCap: 1000, paidCap: 0, forceInclude: [] });
    expect(s.size).toBe(100);
  });
});
