import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePatent } from "./parse";

const html = readFileSync(path.join(__dirname, "../../../test/fixtures/us4786567.html"), "utf8");

describe("parsePatent (VRFB US4786567)", () => {
  const p = parsePatent(html, "US4786567");
  it("extracts the title", () => expect(p.title).toMatch(/vanadium redox battery/i));
  it("extracts an abstract", () => expect((p.abstract ?? "").length).toBeGreaterThan(20));
  it("captures legal events", () => expect(p.legalEvents.length).toBeGreaterThan(0));
  it("does not flag owner-abandonment maintenance lapse (VRFB was actively maintained)",
    () => expect(p.maintenanceLapsed).toBe(false));
  it("flags anticipated expiration (VRFB reached full term — events node, not legalEvents row)",
    () => expect(p.anticipatedExpiration).toBe(true));
});
