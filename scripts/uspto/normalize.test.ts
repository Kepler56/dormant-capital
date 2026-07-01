import { describe, it, expect } from "vitest";
import { normalizeUtilityNumber } from "./normalize";

describe("normalizeUtilityNumber", () => {
  it("unpads a zero-padded utility number", () => {
    expect(normalizeUtilityNumber("0000004786567")).toBe("4786567");
  });
  it("passes through an already-unpadded number", () => {
    expect(normalizeUtilityNumber("4786567")).toBe("4786567");
  });
  it("rejects reissue / design / plant numbers", () => {
    expect(normalizeUtilityNumber("RE040000")).toBeNull();
    expect(normalizeUtilityNumber("D0123456")).toBeNull();
    expect(normalizeUtilityNumber("PP012345")).toBeNull();
  });
  it("rejects empty / all-zero input", () => {
    expect(normalizeUtilityNumber("")).toBeNull();
    expect(normalizeUtilityNumber("0000000000000")).toBeNull();
  });
});
