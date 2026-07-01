import { describe, it, expect } from "vitest";
import { parseFeeLine, deriveLapsed, isPaymentCode, EXP_CODE } from "./fee";

const EXP_ROW  = "0000004291808 06215853 N 19801212 19810929 19851031 EXP. ";
const PAY_ROW  = "0000004287053 06218896 N 19801222 19810901 19881222 M171 ";

describe("parseFeeLine", () => {
  it("parses an EXP. (lapse) record positionally, keeping the trailing period", () => {
    const e = parseFeeLine(EXP_ROW)!;
    expect(e.number).toBe("4291808");
    expect(e.entityStatus).toBe("N");
    expect(e.filingDate).toBe("1980-12-12");
    expect(e.grantDate).toBe("1981-09-29");
    expect(e.eventDate).toBe("1985-10-31");
    expect(e.eventCode).toBe(EXP_CODE);     // "EXP." — period preserved
  });
  it("parses a payment record", () => {
    const e = parseFeeLine(PAY_ROW)!;
    expect(e.number).toBe("4287053");
    expect(e.eventCode).toBe("M171");
    expect(isPaymentCode(e.eventCode)).toBe(true);
  });
  it("returns null for a too-short / malformed line", () => {
    expect(parseFeeLine("garbage")).toBeNull();
  });
  it("returns null for a non-utility (reissue) number", () => {
    expect(parseFeeLine("00000RE40000 06215853 N 19801212 19810929 19851031 EXP. ")).toBeNull();
  });
});

describe("deriveLapsed", () => {
  it("EXP. with no reinstatement ⇒ lapsed", () => {
    expect(deriveLapsed(["M170", "EXP."])).toBe(true);
  });
  it("EXP. later reinstated (EXPX) ⇒ not lapsed", () => {
    expect(deriveLapsed(["EXP.", "EXPX"])).toBe(false);
  });
  it("payments only ⇒ not lapsed", () => {
    expect(deriveLapsed(["M170", "M171"])).toBe(false);
  });
});
