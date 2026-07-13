import { describe, it, expect, beforeEach } from "vitest";
import { db, ready, run } from "@/lib/db/connection";
import { upsertAsset, insertFact, insertMaintenanceEvents } from "@/lib/db/queries";
import { searchLocalIndex } from "./queries";

const RETRIEVED_AT = "2026-07-13T00:00:00.000Z";
const SOURCE = "test_source";
const SOURCE_URL = "http://example/test";

async function seed() {
  // US1: 2000, CPC H01L, dormant (lapsed), small entity.
  await run(`INSERT INTO patent_index (number, grant_year, enriched) VALUES (?, ?, 1)`, ["US1", 2000]);
  const a1 = await upsertAsset("US1");
  await insertFact(a1, { key: "cpc_classes", value: ["H01L21/02"], source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
  await insertFact(a1, { key: "maintenance_lapsed", value: true, source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
  await insertMaintenanceEvents([
    { patentNumber: "US1", appNumber: null, entityStatus: "Y", filingDate: null, grantDate: null,
      eventDate: "2010-01-01", eventCode: "EXPX", source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT },
  ]);

  // US2: 2010, CPC G06F, maintained (not lapsed), large entity.
  await run(`INSERT INTO patent_index (number, grant_year, enriched) VALUES (?, ?, 1)`, ["US2", 2010]);
  const a2 = await upsertAsset("US2");
  await insertFact(a2, { key: "cpc_classes", value: ["G06F1/00"], source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
  await insertFact(a2, { key: "maintenance_lapsed", value: false, source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
  await insertMaintenanceEvents([
    { patentNumber: "US2", appNumber: null, entityStatus: "N", filingDate: null, grantDate: null,
      eventDate: "2015-01-01", eventCode: "M170", source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT },
  ]);

  // US3: 2020, no facts, no maintenance_event at all (mirrors real un-enriched catalogue rows).
  await run(`INSERT INTO patent_index (number, grant_year, enriched) VALUES (?, ?, 0)`, ["US3", 2020]);
}

beforeEach(async () => {
  await ready();
  await db.executeMultiple(
    "DELETE FROM fact; DELETE FROM judgment; DELETE FROM event_log; DELETE FROM asset; " +
    "DELETE FROM patent_index; DELETE FROM maintenance_event;"
  );
  await seed();
});

describe("searchLocalIndex filters", () => {
  it("filters by CPC prefix (matches JSON-encoded cpc_classes fact)", async () => {
    const { rows } = await searchLocalIndex({ cpc: "H01L" });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);
  });

  it("sanitises the CPC prefix (strips quote/wildcard chars, case-insensitive-safe uppercasing)", async () => {
    const { rows } = await searchLocalIndex({ cpc: 'h01l"%_' });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);
  });

  it("filters by entity status: small", async () => {
    const { rows } = await searchLocalIndex({ entityStatus: "small" });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);
  });

  it("filters by entity status: large", async () => {
    const { rows } = await searchLocalIndex({ entityStatus: "large" });
    expect(rows.map((r) => r.number)).toEqual(["US2"]);
  });

  it("filters by status: lapsed (existing dormant-only semantics)", async () => {
    const { rows } = await searchLocalIndex({ status: "lapsed" });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);
  });

  it("filters by status: maintained (excludes the known-lapsed patent)", async () => {
    const { rows } = await searchLocalIndex({ status: "maintained" });
    const numbers = rows.map((r) => r.number);
    expect(numbers).toContain("US2");
    expect(numbers).not.toContain("US1");
  });

  it("sorts newest-first (year_desc) with the no-facts patent (2020) first", async () => {
    const { rows } = await searchLocalIndex({ sort: "year_desc" });
    expect(rows[0].number).toBe("US3");
    expect(rows.at(-1)!.number).toBe("US1");
  });

  it("sorts oldest-first (year_asc) with US1 (2000) first", async () => {
    const { rows } = await searchLocalIndex({ sort: "year_asc" });
    expect(rows[0].number).toBe("US1");
  });

  it("defaults to sorting by patent number", async () => {
    const { rows } = await searchLocalIndex({});
    expect(rows.map((r) => r.number)).toEqual(["US1", "US2", "US3"]);
  });

  it("combines CPC + status filters (AND semantics)", async () => {
    const { rows } = await searchLocalIndex({ cpc: "H01L", status: "lapsed" });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);

    const none = await searchLocalIndex({ cpc: "H01L", status: "maintained" });
    expect(none.rows).toEqual([]);
  });

  it("still supports the legacy dormantOnly flag", async () => {
    const { rows } = await searchLocalIndex({ dormantOnly: true });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);
  });
});
