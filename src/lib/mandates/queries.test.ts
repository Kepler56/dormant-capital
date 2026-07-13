import { describe, it, expect, beforeEach } from "vitest";
import { db, ready } from "@/lib/db/connection";
import * as q from "./queries";

beforeEach(async () => {
  await ready();
  await db.executeMultiple("DELETE FROM mandate;");
});

describe("mandates/queries", () => {
  it("inserts a mandate and returns a numeric id", async () => {
    const id = await q.insertMandate("Grid Storage Buyer", "Long-duration energy storage; US jurisdiction.");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("round-trips insert/list/get/delete", async () => {
    const id = await q.insertMandate("Grid Storage Buyer", "Long-duration energy storage; US jurisdiction.");

    const all = await q.listMandates();
    expect(all.map((m) => m.id)).toContain(id);

    const one = await q.getMandate(id);
    expect(one).not.toBeNull();
    expect(one?.name).toBe("Grid Storage Buyer");
    expect(one?.thesis).toBe("Long-duration energy storage; US jurisdiction.");

    await q.deleteMandate(id);
    expect(await q.getMandate(id)).toBeNull();
    expect((await q.listMandates()).map((m) => m.id)).not.toContain(id);
  });

  it("throws on empty name", async () => {
    await expect(q.insertMandate("", "Some thesis")).rejects.toThrow();
  });

  it("throws on empty thesis", async () => {
    await expect(q.insertMandate("Some Buyer", "")).rejects.toThrow();
  });

  it("throws on whitespace-only name/thesis", async () => {
    await expect(q.insertMandate("   ", "Some thesis")).rejects.toThrow();
    await expect(q.insertMandate("Some Buyer", "   ")).rejects.toThrow();
  });

  it("getMandate returns null for unknown id", async () => {
    expect(await q.getMandate(999999)).toBeNull();
  });
});
