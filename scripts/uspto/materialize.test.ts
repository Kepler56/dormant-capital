// scripts/uspto/materialize.test.ts
import { describe, it, expect } from "vitest";
import { materializePatent } from "./materialize";
import { upsertAsset } from "../../src/lib/db/queries";
import { getFacts } from "../../src/lib/db/queries";
import { getMaintenanceEvents } from "../../src/lib/db/queries";
import { get } from "../../src/lib/db/connection";

const URLS = { fee: "https://fee", gPatent: "https://gp", assignee: "https://asg", cpc: "https://cpc" };

describe("materializePatent", () => {
  it("writes events, an enriched index row, and dormancy facts with provenance", async () => {
    await materializePatent({
      number: "5111111",
      events: [
        { number: "5111111", appNumber: "07000001", entityStatus: "N", filingDate: "1990-01-01", grantDate: "1992-05-05", eventDate: "1995-01-01", eventCode: "M170" },
        { number: "5111111", appNumber: "07000001", entityStatus: "N", filingDate: "1990-01-01", grantDate: "1992-05-05", eventDate: "2000-01-01", eventCode: "EXP." },
      ],
      title: "Test widget", assignee: "Acme Co", grantDate: "1992-05-05",
      filingDate: "1990-01-01", entityStatus: "N", cpc: ["H01M8/188"],
    }, URLS, "2026-06-29T00:00:00.000Z");

    expect(await getMaintenanceEvents("US5111111")).toHaveLength(2);

    const assetId = await upsertAsset("US5111111");
    const facts = await getFacts(assetId);
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]));
    expect(byKey["title"]).toBe("Test widget");
    expect(byKey["maintenance_lapsed"]).toBe(true);
    expect(facts.find((f) => f.key === "maintenance_lapsed")!.source).toBe("uspto_maintenance_fee_events");

    const idx = await get<{ title: string; assignee: string; enriched: number; grant_year: number }>(
      "SELECT title, assignee, enriched, grant_year FROM patent_index WHERE number=?", ["US5111111"]
    );
    expect(idx!.enriched).toBe(1);
    expect(idx!.title).toBe("Test widget");
    expect(idx!.grant_year).toBe(1992);
  });

  it("derives maintenance_lapsed=false for a reinstated patent", async () => {
    await materializePatent({
      number: "5222222",
      events: [
        { number: "5222222", appNumber: "07000002", entityStatus: "N", filingDate: "1990-01-01", grantDate: "1992-06-06", eventDate: "2000-01-01", eventCode: "EXP." },
        { number: "5222222", appNumber: "07000002", entityStatus: "N", filingDate: "1990-01-01", grantDate: "1992-06-06", eventDate: "2001-01-01", eventCode: "EXPX" },
      ],
      title: "Reinstated", assignee: "B Co", grantDate: "1992-06-06",
      filingDate: "1990-01-01", entityStatus: "N", cpc: [],
    }, URLS, "2026-06-29T00:00:00.000Z");
    const assetId = await upsertAsset("US5222222");
    const lapsed = (await getFacts(assetId)).find((f) => f.key === "maintenance_lapsed")!;
    expect(lapsed.value).toBe(false);
  });

  it("is idempotent: calling materializePatent twice does not duplicate facts", async () => {
    const bundle = {
      number: "5111111",
      events: [
        { number: "5111111", appNumber: "07000001", entityStatus: "N", filingDate: "1990-01-01", grantDate: "1992-05-05", eventDate: "1995-01-01", eventCode: "M170" },
        { number: "5111111", appNumber: "07000001", entityStatus: "N", filingDate: "1990-01-01", grantDate: "1992-05-05", eventDate: "2000-01-01", eventCode: "EXP." },
      ],
      title: "Test widget", assignee: "Acme Co", grantDate: "1992-05-05",
      filingDate: "1990-01-01", entityStatus: "N", cpc: ["H01M8/188"],
    };
    await materializePatent(bundle, URLS, "2026-06-29T00:00:00.000Z");
    const assetId = await upsertAsset("US5111111");
    const countAfterFirst = (await getFacts(assetId)).length;
    await materializePatent(bundle, URLS, "2026-06-29T01:00:00.000Z");
    expect((await getFacts(assetId)).length).toBe(countAfterFirst);
  });
});
