import { describe, it, expect, beforeEach } from "vitest";
import { db, ready } from "./connection";
import * as q from "./queries";

beforeEach(async () => {
  await ready();
  await db.executeMultiple("DELETE FROM fact; DELETE FROM judgment; DELETE FROM event_log; DELETE FROM asset;");
});

describe("queries", () => {
  it("upserts an asset and returns a stable id", async () => {
    const id1 = await q.upsertAsset("US4786567");
    const id2 = await q.upsertAsset("US4786567");
    expect(id1).toBe(id2);
  });

  it("stores and reads facts as decoded JSON values", async () => {
    const id = await q.upsertAsset("US4786567");
    await q.insertFact(id, { key: "title", value: "All-vanadium redox battery", source: "google_patents", sourceUrl: "http://x", retrievedAt: "2026-06-14T00:00:00Z" });
    const facts = await q.getFacts(id);
    expect(facts[0].value).toBe("All-vanadium redox battery");
  });

  it("appends and counts event_log rows by type for today", async () => {
    await q.appendEvent("analyze_requested", null, {});
    await q.appendEvent("analyze_requested", null, {});
    expect(await q.countEventsToday("analyze_requested")).toBe(2);
  });
});
