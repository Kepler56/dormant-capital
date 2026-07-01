import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./connection";
import * as q from "./queries";

beforeEach(() => {
  db.exec("DELETE FROM fact; DELETE FROM judgment; DELETE FROM event_log; DELETE FROM asset;");
});

describe("queries", () => {
  it("upserts an asset and returns a stable id", () => {
    const id1 = q.upsertAsset("US4786567");
    const id2 = q.upsertAsset("US4786567");
    expect(id1).toBe(id2);
  });

  it("stores and reads facts as decoded JSON values", () => {
    const id = q.upsertAsset("US4786567");
    q.insertFact(id, { key: "title", value: "All-vanadium redox battery", source: "google_patents", sourceUrl: "http://x", retrievedAt: "2026-06-14T00:00:00Z" });
    const facts = q.getFacts(id);
    expect(facts[0].value).toBe("All-vanadium redox battery");
  });

  it("appends and counts event_log rows by type for today", () => {
    q.appendEvent("analyze_requested", null, {});
    q.appendEvent("analyze_requested", null, {});
    expect(q.countEventsToday("analyze_requested")).toBe(2);
  });
});
