// app/api/outcomes/route.test.ts
// Why: the outcomes route validates the request itself before touching insertOutcome (malformed
// JSON, a non-integer/garbage assetId, an assetId that doesn't reference a real asset — libSQL
// doesn't enforce the FK, so an unvalidated id would land a permanent dangling row in the moat
// ledger). These are Web-standard Request/Response handlers, so they're callable directly against
// the same in-memory test DB the queries-layer tests use — no HTTP server needed.
import { describe, it, expect, beforeEach } from "vitest";
import { ready, db } from "@/lib/db/connection";
import { upsertAsset } from "@/lib/db/queries";
import { POST, GET } from "./route";

function req(body: unknown, { raw }: { raw?: string } = {}): Request {
  return new Request("http://localhost/api/outcomes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

beforeEach(async () => {
  await ready();
  await db.executeMultiple("DELETE FROM outcome; DELETE FROM event_log; DELETE FROM asset;");
});

describe("POST /api/outcomes", () => {
  it("400s on a malformed JSON body instead of throwing", async () => {
    const res = await POST(req(null, { raw: "{not json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body." });
  });

  it("400s on a non-numeric assetId", async () => {
    const res = await POST(req({ assetId: "abc", eventType: "owner_identified" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("400s on a NaN/garbage assetId that Number() would silently pass through", async () => {
    const res = await POST(req({ assetId: Number.NaN, eventType: "owner_identified" }));
    expect(res.status).toBe(400);
  });

  it("400s on a non-positive assetId", async () => {
    const res = await POST(req({ assetId: -1, eventType: "owner_identified" }));
    expect(res.status).toBe(400);
  });

  it("404s when assetId is a valid integer but no such asset exists", async () => {
    const res = await POST(req({ assetId: 999999, eventType: "owner_identified" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Unknown asset." });
  });

  it("inserts and returns ok:true for a valid assetId referencing a real asset", async () => {
    const assetId = await upsertAsset("US4786567");
    const res = await POST(req({ assetId, eventType: "owner_identified" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("still surfaces insertOutcome's own validation as a 400 (terminal event, no reason code)", async () => {
    const assetId = await upsertAsset("US4786567");
    const res = await POST(req({ assetId, eventType: "rejected" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/coded reason is mandatory/);
  });
});

describe("GET /api/outcomes", () => {
  it("400s on a missing/non-numeric assetId instead of handing NaN to the driver", async () => {
    const res = await GET(new Request("http://localhost/api/outcomes"));
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it("400s on a non-positive assetId", async () => {
    const res = await GET(new Request("http://localhost/api/outcomes?assetId=-5"));
    expect(res.status).toBe(400);
  });

  it("returns outcomes for a valid assetId", async () => {
    const assetId = await upsertAsset("US4786567");
    await POST(req({ assetId, eventType: "owner_identified" }));
    const res = await GET(new Request(`http://localhost/api/outcomes?assetId=${assetId}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.outcomes).toHaveLength(1);
    expect(json.outcomes[0].event_type).toBe("owner_identified");
  });
});
