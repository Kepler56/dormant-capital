import { describe, it, expect, beforeEach } from "vitest";
import { db, ready, run } from "@/lib/db/connection";
import { upsertAsset, insertFact, insertMaintenanceEvents, appendEvent } from "@/lib/db/queries";
import { searchLocalIndex } from "./queries";

const RETRIEVED_AT = "2026-07-13T00:00:00.000Z";
const SOURCE = "test_source";
const SOURCE_URL = "http://example/test";

// One year before "now" (in ISO YYYY-MM-DD), so the recent2 lapse-age assertion stays true no
// matter when the suite runs — mirrors the brief's "dynamic: compute an ISO date 1y before now".
function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  // US1: 2000, CPC H01L (+ A61K31/00 → sector medicine), dormant (lapsed), small entity,
  // an EXP. lapse event ~1 year ago (lapseAge recent2).
  await run(`INSERT INTO patent_index (number, grant_year, enriched) VALUES (?, ?, 1)`, ["US1", 2000]);
  const a1 = await upsertAsset("US1");
  await insertFact(a1, { key: "cpc_classes", value: ["H01L21/02", "A61K31/00"], source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
  await insertFact(a1, { key: "maintenance_lapsed", value: true, source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
  await insertMaintenanceEvents([
    { patentNumber: "US1", appNumber: null, entityStatus: "Y", filingDate: null, grantDate: null,
      eventDate: "2010-01-01", eventCode: "EXPX", source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT },
    { patentNumber: "US1", appNumber: null, entityStatus: "Y", filingDate: null, grantDate: null,
      eventDate: isoYearsAgo(1), eventCode: "EXP.", source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT },
  ]);

  // US2: 2010, CPC G06F17/30 (sector computing), maintained (not lapsed), large entity,
  // a stale EXP. lapse event (2015, well past the 5-year window) and a scored+REVIVAL run.
  await run(`INSERT INTO patent_index (number, grant_year, enriched) VALUES (?, ?, 1)`, ["US2", 2010]);
  const a2 = await upsertAsset("US2");
  await insertFact(a2, { key: "cpc_classes", value: ["G06F17/30"], source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
  await insertFact(a2, { key: "maintenance_lapsed", value: false, source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT });
  await insertMaintenanceEvents([
    { patentNumber: "US2", appNumber: null, entityStatus: "N", filingDate: null, grantDate: null,
      eventDate: "2015-01-01", eventCode: "M170", source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT },
    { patentNumber: "US2", appNumber: null, entityStatus: "N", filingDate: null, grantDate: null,
      eventDate: "2015-01-01", eventCode: "EXP.", source: SOURCE, sourceUrl: SOURCE_URL, retrievedAt: RETRIEVED_AT },
  ]);
  await appendEvent("score_computed", a2, { result: { route: "REVIVAL" } });

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

  // ── Sector ──────────────────────────────────────────────────────────────────
  it("filters by sector: medicine (CPC prefix A61)", async () => {
    const { rows } = await searchLocalIndex({ sector: "medicine" });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);
  });

  it("filters by sector: computing (CPC prefix G06)", async () => {
    const { rows } = await searchLocalIndex({ sector: "computing" });
    expect(rows.map((r) => r.number)).toEqual(["US2"]);
  });

  it("ignores an invalid sector value (same as unfiltered)", async () => {
    const { rows } = await searchLocalIndex({ sector: "not-a-sector" as never });
    expect(rows.map((r) => r.number)).toEqual(["US1", "US2", "US3"]);
  });

  // ── Lapse recency ─────────────────────────────────────────────────────────────
  it("filters by lapseAge: recent2 (EXP. event within 2 years)", async () => {
    const { rows } = await searchLocalIndex({ lapseAge: "recent2" });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);
  });

  it("filters by lapseAge: stale5 (has EXP. but none within 5 years)", async () => {
    const { rows } = await searchLocalIndex({ lapseAge: "stale5" });
    expect(rows.map((r) => r.number)).toEqual(["US2"]);
  });

  it("ignores an invalid lapseAge value (same as unfiltered)", async () => {
    const { rows } = await searchLocalIndex({ lapseAge: "not-a-lapse-age" as never });
    expect(rows.map((r) => r.number)).toEqual(["US1", "US2", "US3"]);
  });

  // ── Analysis status / route ───────────────────────────────────────────────────
  it("filters by analysis: analyzed", async () => {
    const { rows } = await searchLocalIndex({ analysis: "analyzed" });
    expect(rows.map((r) => r.number)).toEqual(["US2"]);
  });

  it("filters by analysis: not_analyzed (excludes the scored patent)", async () => {
    const { rows } = await searchLocalIndex({ analysis: "not_analyzed" });
    const numbers = rows.map((r) => r.number);
    expect(numbers).toContain("US1");
    expect(numbers).toContain("US3");
    expect(numbers).not.toContain("US2");
  });

  it("filters by analysis: route_revival", async () => {
    const { rows } = await searchLocalIndex({ analysis: "route_revival" });
    expect(rows.map((r) => r.number)).toEqual(["US2"]);
  });

  it("filters by analysis: route_license (no match in the seed)", async () => {
    const { rows } = await searchLocalIndex({ analysis: "route_license" });
    expect(rows).toEqual([]);
  });

  it("ignores an invalid analysis value (same as unfiltered)", async () => {
    const { rows } = await searchLocalIndex({ analysis: "not-a-route" as never });
    expect(rows.map((r) => r.number)).toEqual(["US1", "US2", "US3"]);
  });

  it("ignores an Object.prototype-shaped analysis value (no prototype-chain whitelist bypass)", async () => {
    const { rows } = await searchLocalIndex({ analysis: "constructor" as never });
    expect(rows.map((r) => r.number)).toEqual(["US1", "US2", "US3"]);
  });

  // ── Composition ────────────────────────────────────────────────────────────────
  it("combines sector + lapseAge filters (AND semantics)", async () => {
    const { rows } = await searchLocalIndex({ sector: "medicine", lapseAge: "recent2" });
    expect(rows.map((r) => r.number)).toEqual(["US1"]);

    const none = await searchLocalIndex({ sector: "computing", lapseAge: "recent2" });
    expect(none.rows).toEqual([]);
  });
});
