// lib/index/year.ts
// Why: we bundle real US patent NUMBERS but no dates, so we approximate each patent's
// grant year from its number. US utility grants are issued sequentially, and the USPTO
// has publicly celebrated round-number milestone patents on known dates — those give us
// honest interpolation anchors. The result is labelled "~year" in the UI; it is an
// estimate, never asserted as exact.
//
// Anchors: documented USPTO milestone utility patents and their grant dates, expressed as
// a fractional year (year + day-of-year/365) for smooth interpolation.
const ANCHORS: [number, number][] = [
  [6_000_000, 1999.93], // US6,000,000 — 1999-12-07
  [7_000_000, 2006.12], // US7,000,000 — 2006-02-14
  [8_000_000, 2011.62], // US8,000,000 — 2011-08-16
  [9_000_000, 2015.27], // US9,000,000 — 2015-04-07
  [10_000_000, 2018.46], // US10,000,000 — 2018-06-19
  [11_000_000, 2021.36], // US11,000,000 — 2021-05-11
];

// Extract the integer part of a "US7123456" style number.
export function numericPart(patentNumber: string): number {
  return parseInt(patentNumber.replace(/\D/g, ""), 10);
}

// Approximate grant year for a utility-patent number via linear interpolation between
// the surrounding milestone anchors (extrapolating at the ends).
export function grantYearForNumber(patentNumber: string): number {
  const n = numericPart(patentNumber);
  if (!n) return 0;
  let lo = ANCHORS[0];
  let hi = ANCHORS[ANCHORS.length - 1];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    if (n >= ANCHORS[i][0] && n <= ANCHORS[i + 1][0]) {
      lo = ANCHORS[i];
      hi = ANCHORS[i + 1];
      break;
    }
  }
  const frac = (n - lo[0]) / (hi[0] - lo[0]);
  return Math.floor(lo[1] + frac * (hi[1] - lo[1]));
}
