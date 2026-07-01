// src/lib/pipeline/local-ingest.test.ts
import { describe, it, expect } from "vitest";
import { localIngestPatent } from "./ingest";
import { insertMaintenanceEvents, upsertAsset, insertFact, findAssetId } from "@/lib/db/queries";

describe("localIngestPatent", () => {
  it("returns the asset when the patent is already loaded locally", async () => {
    const id = await upsertAsset("5333333");
    await insertFact(id, { key: "title", value: "Loaded", source: "patentsview_bulk", sourceUrl: "u", retrievedAt: "t" });
    await insertMaintenanceEvents([{ patentNumber: "5333333", appNumber: null, entityStatus: "N",
      filingDate: null, grantDate: null, eventDate: "2000-01-01", eventCode: "EXP.",
      source: "uspto_maintenance_fee_events", sourceUrl: "u", retrievedAt: "t" }]);
    const res = await localIngestPatent("5333333");
    expect(res).not.toBeNull();
    expect(res!.assetId).toBe(id);
  });
  it("returns null for a number with no local data", async () => {
    expect(await localIngestPatent("9999999")).toBeNull();
  });
  it("does not create an orphan asset row when patent is not loaded locally", async () => {
    const result = await localIngestPatent("9999999");
    expect(result).toBeNull();
    expect(await findAssetId("9999999")).toBeNull();
  });
});
