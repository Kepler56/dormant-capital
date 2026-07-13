// lib/index/queries.ts
// Why: the data access for the local patent catalogue that backs the Patents table. All
// filtering/pagination happens in SQLite against the bundled index, so browsing is
// instant and never touches the network — the fix for the Google Patents 503s.
import { all, get, run } from "@/lib/db/connection";
import type { InArgs } from "@libsql/client";

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
