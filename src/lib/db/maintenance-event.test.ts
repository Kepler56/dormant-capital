import { describe, it, expect } from "vitest";
import { insertMaintenanceEvents, getMaintenanceEvents } from "./queries";

describe("maintenance_event store", () => {
  it("inserts and reads back events for a patent number", () => {
    insertMaintenanceEvents([
      { patentNumber: "4786567", appNumber: "06849413", entityStatus: "N",
        filingDate: "1986-04-08", grantDate: "1988-11-22", eventDate: "1992-05-01",
        eventCode: "M170", source: "uspto_maintenance_fee_events",
        sourceUrl: "https://example/fee.zip", retrievedAt: "2026-06-29T00:00:00.000Z" },
      { patentNumber: "4786567", appNumber: "06849413", entityStatus: "N",
        filingDate: "1986-04-08", grantDate: "1988-11-22", eventDate: "1996-05-01",
        eventCode: "M171", source: "uspto_maintenance_fee_events",
        sourceUrl: "https://example/fee.zip", retrievedAt: "2026-06-29T00:00:00.000Z" },
    ]);
    const rows = getMaintenanceEvents("4786567");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.eventCode)).toEqual(["M170", "M171"]);
    expect(rows[0].source).toBe("uspto_maintenance_fee_events");
  });

  it("prevents duplicate events on re-insert (idempotent)", () => {
    const events = [
      { patentNumber: "5555555", appNumber: "11111111", entityStatus: "N",
        filingDate: "2000-01-01", grantDate: "2002-01-01", eventDate: "2006-01-01",
        eventCode: "M170", source: "uspto_maintenance_fee_events",
        sourceUrl: "https://example/fee.zip", retrievedAt: "2026-06-29T00:00:00.000Z" },
      { patentNumber: "5555555", appNumber: "11111111", entityStatus: "N",
        filingDate: "2000-01-01", grantDate: "2002-01-01", eventDate: "2010-01-01",
        eventCode: "M171", source: "uspto_maintenance_fee_events",
        sourceUrl: "https://example/fee.zip", retrievedAt: "2026-06-29T00:00:00.000Z" },
    ];
    // Insert twice — second insert should be silent no-op
    insertMaintenanceEvents(events);
    insertMaintenanceEvents(events);
    const rows = getMaintenanceEvents("5555555");
    expect(rows).toHaveLength(2); // Still 2, not 4
  });

  it("returns empty list for unknown patent number", () => {
    const rows = getMaintenanceEvents("9999999");
    expect(rows).toEqual([]);
  });
});
