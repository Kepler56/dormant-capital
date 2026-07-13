import { describe, it, expect, beforeEach } from "vitest";
import { db, ready } from "@/lib/db/connection";
import { upsertAsset, getEvents } from "@/lib/db/queries";
import * as q from "./queries";
import type { OutcomeEvent, ReasonCode } from "./types";

beforeEach(async () => {
  await ready();
  await db.executeMultiple("DELETE FROM outcome; DELETE FROM event_log; DELETE FROM asset;");
});

describe("outcomes/queries", () => {
  it("inserts a non-terminal event without a reason code", async () => {
    const assetId = await upsertAsset("US4786567");
    await expect(q.insertOutcome({ assetId, eventType: "owner_identified" })).resolves.toBeUndefined();
    const rows = await q.listOutcomes(assetId);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("owner_identified");
    expect(rows[0].reason_code).toBeNull();
  });

  it("throws the exact message when a terminal event (rejected) has no reason code", async () => {
    const assetId = await upsertAsset("US4786567");
    await expect(q.insertOutcome({ assetId, eventType: "rejected" })).rejects.toThrow(
      "A coded reason is mandatory on terminal outcomes (closed/rejected)."
    );
  });

  it("allows a terminal event (rejected) with a valid reason code", async () => {
    const assetId = await upsertAsset("US4786567");
    await expect(
      q.insertOutcome({ assetId, eventType: "rejected", reasonCode: "price_gap" })
    ).resolves.toBeUndefined();
    const rows = await q.listOutcomes(assetId);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("rejected");
    expect(rows[0].reason_code).toBe("price_gap");
  });

  it("throws on an unknown event type", async () => {
    const assetId = await upsertAsset("US4786567");
    await expect(
      q.insertOutcome({ assetId, eventType: "made_up_event" as unknown as OutcomeEvent })
    ).rejects.toThrow();
  });

  it("throws on an unknown reason code", async () => {
    const assetId = await upsertAsset("US4786567");
    await expect(
      q.insertOutcome({ assetId, eventType: "rejected", reasonCode: "made_up_reason" as unknown as ReasonCode })
    ).rejects.toThrow();
  });

  it("lists outcomes oldest-first", async () => {
    const assetId = await upsertAsset("US4786567");
    await q.insertOutcome({ assetId, eventType: "owner_identified" });
    await q.insertOutcome({ assetId, eventType: "owner_reachable" });
    await q.insertOutcome({ assetId, eventType: "buyer_interest" });
    const rows = await q.listOutcomes(assetId);
    expect(rows.map((r) => r.event_type)).toEqual(["owner_identified", "owner_reachable", "buyer_interest"]);
  });

  it("appends an outcome_logged row to the append-only event_log on every insert", async () => {
    const assetId = await upsertAsset("US4786567");
    await q.insertOutcome({ assetId, eventType: "rejected", reasonCode: "timing" });
    const events = await getEvents(assetId);
    const logged = events.find((e) => e.event_type === "outcome_logged");
    expect(logged).toBeDefined();
    expect(logged!.payload).toMatchObject({ eventType: "rejected", reasonCode: "timing" });
  });
});
