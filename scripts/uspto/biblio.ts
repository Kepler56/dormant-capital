// Why: the PatentsView bulk tables are tab-separated with a header row. Real PatentsView
// dumps QUOTE every string field — header names and string cells alike (CSV-style:
// "patent_id", "10000000", "All-vanadium…") — while numeric fields (sequences) are bare.
// So we strip surrounding double-quotes from every header name and cell before use, or every
// column lookup misses and the whole join yields nothing. We resolve columns by NAME (header
// index) so the parsers survive column-order changes, and key everything on the normalized
// utility patent number to join against the fee-file population.
import { normalizeUtilityNumber } from "./normalize";

// Strip a trailing CR and, when the field is wrapped in double-quotes, the surrounding quotes
// (unescaping doubled "" -> "). Bare/unquoted fields pass through unchanged, so this is safe
// for both the real quoted dumps and unquoted test fixtures.
function unquote(v: string | undefined): string {
  let s = (v ?? "").replace(/\r$/, "");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

export function headerIndex(headerLine: string): Record<string, number> {
  const idx: Record<string, number> = {};
  headerLine.replace(/\r$/, "").split("\t").forEach((name, i) => { idx[unquote(name).trim()] = i; });
  return idx;
}

const num = (cols: string[], idx: Record<string, number>): string | null =>
  normalizeUtilityNumber(unquote(cols[idx["patent_id"]]).trim());
const clean = (v: string | undefined): string | null => {
  const t = unquote(v).trim();
  return t.length ? t : null;
};
const seq = (v: string | undefined): number => Number(unquote(v)) || 0;

export function parseGPatent(cols: string[], idx: Record<string, number>) {
  const number = num(cols, idx);
  if (!number) return null;
  return { number, title: clean(cols[idx["patent_title"]]), grantDate: clean(cols[idx["patent_date"]]) };
}

export function parseAssignee(cols: string[], idx: Record<string, number>) {
  const number = num(cols, idx);
  if (!number) return null;
  const org = clean(cols[idx["disambig_assignee_organization"]]);
  const first = clean(cols[idx["disambig_assignee_individual_name_first"]]);
  const last = clean(cols[idx["disambig_assignee_individual_name_last"]]);
  const name = org ?? ([first, last].filter(Boolean).join(" ") || null);
  return { number, sequence: seq(cols[idx["assignee_sequence"]]), org: name };
}

export function parseCpc(cols: string[], idx: Record<string, number>) {
  const number = num(cols, idx);
  if (!number) return null;
  const symbol = clean(cols[idx["cpc_group"]]) ?? clean(cols[idx["cpc_subclass"]]);
  if (!symbol) return null;
  return { number, sequence: seq(cols[idx["cpc_sequence"]]), symbol };
}
