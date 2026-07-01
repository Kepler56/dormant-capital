// scripts/uspto/config.test.ts
import { describe, it, expect } from "vitest";
import { SOURCES, loaderConfig, VRFB } from "./config";

describe("loader config", () => {
  it("pins key-free Wayback URLs for every source", () => {
    for (const s of Object.values(SOURCES)) {
      expect(s.url).toMatch(/^https:\/\/web\.archive\.org\/web\//);
    }
    expect(SOURCES.fee.entryMatch("MaintFeeEvents_20250304.txt")).toBe(true);
    expect(SOURCES.gPatent.entryMatch("g_patent.tsv")).toBe(true);
  });
  it("defaults caps and reads env overrides", () => {
    expect(VRFB).toBe("4786567");
    const base = loaderConfig();
    expect(base.dormantCap).toBeGreaterThan(0);
    process.env.USPTO_DORMANT_CAP = "7";
    expect(loaderConfig().dormantCap).toBe(7);
    delete process.env.USPTO_DORMANT_CAP;
  });
});
