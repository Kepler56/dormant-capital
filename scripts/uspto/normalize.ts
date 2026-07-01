// Why: the fee file stores 13-char zero-padded utility numbers ("0000004786567");
// PatentsView patent_id is unpadded ("4786567"). The join key is the unpadded utility
// number. Non-utility patents (RE/D/PP prefixes — any non-digit) are out of scope this pass.
export function normalizeUtilityNumber(raw: string): string | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;        // non-utility or junk
  const n = t.replace(/^0+/, "");
  return n.length ? n : null;               // all-zero ⇒ invalid
}
