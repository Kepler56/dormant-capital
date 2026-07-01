// scripts/uspto/run.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { runLoad } from "./run";
import { dormancyGate } from "@/lib/scoring/gate";
import { upsertAsset, getFacts, getMaintenanceEvents } from "@/lib/db/queries";
import type { ParsedPatent } from "@/lib/types";

const fx = (n: string) => path.join(__dirname, "fixtures", n);

beforeAll(() => {
  process.env.USPTO_FEE_PATH = fx("fee.txt");
  process.env.USPTO_GPATENT_PATH = fx("g_patent.tsv");
  process.env.USPTO_ASSIGNEE_PATH = fx("g_assignee.tsv");
  process.env.USPTO_CPC_PATH = fx("g_cpc.tsv");
  process.env.USPTO_DORMANT_CAP = "100";
  process.env.USPTO_PAID_CAP = "100";
});

const factsOf = (num: string) => {
  const facts = getFacts(upsertAsset(num));
  return Object.fromEntries(facts.map((f) => [f.key, f.value]));
};

describe("runLoad integration", () => {
  beforeAll(async () => { await runLoad(); });

  it("loads VRFB, the lapsed, the reinstated, and the control patent", () => {
    expect(getMaintenanceEvents("US4786567").length).toBeGreaterThan(0);
    expect(factsOf("US5111111")["maintenance_lapsed"]).toBe(true);   // EXP. only
    expect(factsOf("US5222222")["maintenance_lapsed"]).toBe(false);  // EXP. then EXPX
    expect(getMaintenanceEvents("US5333333").length).toBeGreaterThan(0);
    expect(factsOf("US5333333")["maintenance_lapsed"]).toBe(false);
  });

  it("REGRESSION: VRFB US 4,786,567 is NOT dormant and passes the gate (PASS)", () => {
    const f = factsOf("US4786567");
    expect(f["maintenance_lapsed"]).toBe(false);
    expect(f["title"]).toMatch(/vanadium/i);
    expect(f["assignee"]).toBe("Unisearch Ltd");
    // Feed the derived signal into the real gate; VRFB must NOT clear the dormancy floor.
    const parsed = { maintenanceLapsed: f["maintenance_lapsed"] as boolean, anticipatedExpiration: false } as ParsedPatent;
    const gate = dormancyGate(parsed);
    expect(gate.passedGate).toBe(false);  // not flagged dormant — the canonical correctness test
  });

  it("flags the lapsed patent as dormant through the gate", () => {
    const gate = dormancyGate({ maintenanceLapsed: true, anticipatedExpiration: false } as ParsedPatent);
    expect(gate.passedGate).toBe(true);
  });
});
