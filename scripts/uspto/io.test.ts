// scripts/uspto/io.test.ts
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sourceLines } from "./io";

describe("sourceLines (plain-text)", () => {
  it("yields CRLF-stripped lines from a .txt file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "usptoio-"));
    const f = path.join(dir, "sample.txt");
    writeFileSync(f, "line1\r\nline2\r\nline3", "utf8");
    const out: string[] = [];
    for await (const l of sourceLines(f, () => true)) out.push(l);
    expect(out).toEqual(["line1", "line2", "line3"]);
  });
});
