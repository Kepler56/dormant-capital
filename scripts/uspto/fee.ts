// Why: the Maintenance Fee Events file is fixed-width ASCII (59 chars + CRLF). Fields are
// read by byte slice, NOT whitespace-split, because event codes vary in length and some
// contain a significant period (e.g. "EXP."). See spec for the verified column map.
import { normalizeUtilityNumber } from "./normalize";

export const EXP_CODE = "EXP.";   // Patent Expired for Failure to Pay Maintenance Fees
export const EXPX_CODE = "EXPX";  // Patent Reinstated After Maintenance Fee Payment Confirmed

export type FeeEvent = {
  number: string; appNumber: string; entityStatus: string | null;
  filingDate: string | null; grantDate: string | null; eventDate: string | null; eventCode: string;
};

const isoDate = (raw: string): string | null => {
  const s = raw.trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
};

export function parseFeeLine(line: string): FeeEvent | null {
  if (line.length < 57) return null;                 // too short to hold all fixed fields
  const number = normalizeUtilityNumber(line.slice(0, 13));
  if (!number) return null;                          // non-utility / malformed number
  const eventCode = line.slice(52, 57).replace(/\s+$/, "");  // rstrip only; keep the period
  if (!eventCode) return null;
  const entity = line.slice(23, 24).trim();
  return {
    number,
    appNumber: line.slice(14, 22).trim(),
    entityStatus: entity || null,
    filingDate: isoDate(line.slice(25, 33)),
    grantDate: isoDate(line.slice(34, 42)),
    eventDate: isoDate(line.slice(43, 51)),
    eventCode,
  };
}

// Renewal payment families across the file's 1981→present history (large/small/micro +
// legacy PL-era codes). Used only to identify a "still-paying" control group.
export function isPaymentCode(code: string): boolean {
  return /^[MF]\d{2,4}$/.test(code);
}

export function deriveLapsed(codes: string[]): boolean {
  return codes.includes(EXP_CODE) && !codes.includes(EXPX_CODE);
}
