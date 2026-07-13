// lib/index/queries.ts
// Why: the data access for the local patent catalogue that backs the Patents table. All
// filtering/pagination happens in SQLite against the bundled index, so browsing is
// instant and never touches the network — the fix for the Google Patents 503s.
import { all, get, run } from "@/lib/db/connection";
import type { InArgs } from "@libsql/client";
import { SECTORS, SECTOR_KEYS, type SectorKey } from "./sectors";

export type IndexRow = {
  number: string;
  grant_year: number | null;
  title: string | null;
  assignee: string | null;
  enriched: number;
};

export type IndexFilters = {
  q?: string;          // matches number, or (once enriched) title/assignee
  assignee?: string;   // matches assignee specifically
  yearAfter?: number;  // grant_year >= yearAfter
  yearBefore?: number; // grant_year <= yearBefore
  dormantOnly?: boolean; // legacy: only patents with a derived maintenance-fee lapse (dormant)
  cpc?: string;         // CPC class prefix, e.g. "H01L" (sanitised before use)
  entityStatus?: "large" | "small" | "micro"; // USPTO fee entity size
  status?: "lapsed" | "maintained"; // maintenance-fee status (supersedes dormantOnly)
  sector?: SectorKey;   // human-friendly grouping of CPC prefixes (see ./sectors)
  lapseAge?: "recent2" | "recent5" | "stale5"; // recency of the most recent EXP. lapse event
  analysis?: "analyzed" | "not_analyzed" | "route_license" | "route_revival" | "route_pdi" | "route_tech";
  sort?: "number" | "year_desc" | "year_asc";
  page?: number;       // 0-based
  pageSize?: number;
};

// Correlated EXISTS on the derived `maintenance_lapsed` FACT (never on the raw event code, so a
// reinstated patent is correctly excluded). Facts JSON-encode booleans, so the value is 'true'.
const DORMANT_EXISTS =
  `EXISTS (SELECT 1 FROM asset a JOIN fact f ON f.asset_id = a.id
           WHERE a.external_id = patent_index.number
             AND f.key = 'maintenance_lapsed' AND f.value = 'true')`;

// CPC class facts are JSON-encoded string arrays, e.g. '["H01L21/02"]'. Correlated EXISTS avoids
// a JSON1 dependency: LIKE on the raw JSON text, bracketed by the opening quote so "H01L" never
// matches an unrelated class that merely contains the same letters mid-string.
const CPC_EXISTS =
  `EXISTS (SELECT 1 FROM asset a JOIN fact f ON f.asset_id = a.id
           WHERE a.external_id = patent_index.number
             AND f.key = 'cpc_classes' AND f.value LIKE ?)`;

// Entity status ("large"/"small"/"micro" in the UI) maps to the USPTO fee-schedule codes stored
// verbatim on maintenance_event rows.
const ENTITY_STATUS_CODE: Record<"large" | "small" | "micro", string> = { large: "N", small: "Y", micro: "M" };
const ENTITY_STATUS_EXISTS =
  `EXISTS (SELECT 1 FROM maintenance_event me
           WHERE me.patent_number = patent_index.number AND me.entity_status = ?)`;

// Lapse-recency EXISTS fragments. `EXP.` (with the trailing period) is the exact maintenance-event
// code for a fee lapse — never confuse this with the `maintenance_lapsed` FACT above: an EXP.
// event can coexist with a later reinstatement, so this is about WHEN a lapse last happened, not
// whether the patent is CURRENTLY dormant (the fact/`status` filter is the authority on that).
const EXP_EXISTS =
  `EXISTS (SELECT 1 FROM maintenance_event me
           WHERE me.patent_number = patent_index.number AND me.event_code = 'EXP.')`;
const EXP_RECENT_EXISTS = (years: 2 | 5) =>
  `EXISTS (SELECT 1 FROM maintenance_event me
           WHERE me.patent_number = patent_index.number AND me.event_code = 'EXP.'
             AND me.event_date >= date('now', '-${years} years'))`;

// Any past score_computed run for this asset (regardless of engine/model/version). Correlated via
// asset.external_id like the other EXISTS fragments above.
const ANALYZED_EXISTS =
  `EXISTS (SELECT 1 FROM asset a JOIN event_log e ON e.asset_id = a.id
           WHERE a.external_id = patent_index.number AND e.event_type = 'score_computed')`;
// Same EXISTS, additionally constrained to a payload LIKE match — used for the route_* filters.
const ANALYZED_ROUTE_EXISTS =
  `EXISTS (SELECT 1 FROM asset a JOIN event_log e ON e.asset_id = a.id
           WHERE a.external_id = patent_index.number AND e.event_type = 'score_computed'
             AND e.payload LIKE ?)`;
// Route strings are server-side constants (never user input) — the whitelisted filter value picks
// a key into this map, and the LIKE param is built from the mapped value, not the raw request.
// Semantics: matches if ANY past run recorded that route, even if a later run recorded another.
const ROUTE_LIKE: Record<"route_license" | "route_revival" | "route_pdi" | "route_tech", string> = {
  route_license: "LICENSE_OR_ACQUIRE",
  route_revival: "REVIVAL",
  route_pdi: "PUBLIC_DOMAIN_INTEL",
  route_tech: "TECH_INFO",
};

// Never interpolate user input into ORDER BY — whitelist the exact SQL fragment per known key.
const SORT: Record<NonNullable<IndexFilters["sort"]>, string> = {
  number: "number",
  year_desc: "grant_year DESC, number",
  year_asc: "grant_year ASC, number",
};

// Strip characters that are meaningful to LIKE/JSON matching (`%`, `_`, `"`) before the prefix is
// embedded in a LIKE param, and uppercase to match how CPC classes are stored.
function sanitiseCpcPrefix(raw: string): string {
  return raw.replace(/[%_"]/g, "").toUpperCase();
}

// A sector ORs the same JSON-bracketed LIKE shape as CPC_EXISTS across every prefix in the
// sector's list, in a single EXISTS. Prefixes come from the server-side SECTORS constant only
// (never user input), but are still bound as params rather than interpolated.
function sectorExists(key: SectorKey): { sql: string; params: string[] } {
  const prefixes = SECTORS[key].prefixes;
  const ors = prefixes.map(() => `f.value LIKE ?`).join(" OR ");
  return {
    sql: `EXISTS (SELECT 1 FROM asset a JOIN fact f ON f.asset_id = a.id
                  WHERE a.external_id = patent_index.number AND f.key = 'cpc_classes'
                    AND (${ors}))`,
    params: prefixes.map((p) => `%"${p}%`),
  };
}

// Build the shared WHERE clause + bound params from the filters (kept in one place so the
// count query and the page query can never drift apart).
function where(f: IndexFilters): { sql: string; params: InArgs } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    // A keyword matches the number always, and title/assignee where we have enriched them.
    clauses.push("(number LIKE ? OR title LIKE ? OR assignee LIKE ?)");
    const like = `%${f.q}%`;
    params.push(like, like, like);
  }
  if (f.assignee) { clauses.push("assignee LIKE ?"); params.push(`%${f.assignee}%`); }
  if (f.yearAfter) { clauses.push("grant_year >= ?"); params.push(f.yearAfter); }
  if (f.yearBefore) { clauses.push("grant_year <= ?"); params.push(f.yearBefore); }
  if (f.dormantOnly) { clauses.push(DORMANT_EXISTS); }
  if (f.status === "lapsed") { clauses.push(DORMANT_EXISTS); }
  if (f.status === "maintained") { clauses.push(`NOT ${DORMANT_EXISTS}`); }
  if (f.cpc) {
    const prefix = sanitiseCpcPrefix(f.cpc);
    if (prefix) { clauses.push(CPC_EXISTS); params.push(`%"${prefix}%`); }
  }
  if (f.entityStatus) {
    const code = ENTITY_STATUS_CODE[f.entityStatus];
    if (code) { clauses.push(ENTITY_STATUS_EXISTS); params.push(code); }
  }
  if (f.sector && (SECTOR_KEYS as string[]).includes(f.sector)) {
    const { sql, params: sectorParams } = sectorExists(f.sector);
    clauses.push(sql);
    params.push(...sectorParams);
  }
  if (f.lapseAge === "recent2") { clauses.push(EXP_RECENT_EXISTS(2)); }
  if (f.lapseAge === "recent5") { clauses.push(EXP_RECENT_EXISTS(5)); }
  if (f.lapseAge === "stale5") { clauses.push(`(${EXP_EXISTS} AND NOT ${EXP_RECENT_EXISTS(5)})`); }
  if (f.analysis === "analyzed") { clauses.push(ANALYZED_EXISTS); }
  if (f.analysis === "not_analyzed") { clauses.push(`NOT ${ANALYZED_EXISTS}`); }
  if (f.analysis && Object.prototype.hasOwnProperty.call(ROUTE_LIKE, f.analysis)) {
    const route = ROUTE_LIKE[f.analysis as keyof typeof ROUTE_LIKE];
    clauses.push(ANALYZED_ROUTE_EXISTS);
    params.push(`%"route":"${route}"%`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params: params as InArgs };
}

export async function searchLocalIndex(f: IndexFilters): Promise<{ total: number; rows: IndexRow[] }> {
  const { sql, params } = where(f);
  const totalRow = await get<{ n: number }>(`SELECT COUNT(*) n FROM patent_index ${sql}`, params);
  const total = Number(totalRow?.n ?? 0);
  const pageSize = Math.min(f.pageSize ?? 25, 100);
  const offset = Math.max(0, f.page ?? 0) * pageSize;
  // Default order (by number) keeps paging stable; year_desc/year_asc are opt-in via `sort`.
  const orderBy = SORT[f.sort ?? "number"] ?? SORT.number;
  const rows = await all<IndexRow>(
    `SELECT number, grant_year, title, assignee, enriched FROM patent_index
     ${sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...(params as unknown[]), pageSize, offset] as InArgs
  );
  return { total, rows };
}

// Persist enriched metadata for one patent (called after a successful page scrape).
export async function updateIndexMeta(number: string, title: string | null, assignee: string | null): Promise<void> {
  await run(
    `INSERT INTO patent_index (number, title, assignee, enriched, updated_at)
     VALUES (?, ?, ?, 1, datetime('now'))
     ON CONFLICT(number) DO UPDATE SET title=excluded.title, assignee=excluded.assignee,
       enriched=1, updated_at=excluded.updated_at`,
    [number, title, assignee]
  );
}

export async function indexTotal(): Promise<number> {
  const row = await get<{ n: number }>("SELECT COUNT(*) n FROM patent_index");
  return Number(row?.n ?? 0);
}
