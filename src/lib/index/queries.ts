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
  dormantOnly?: boolean; // only patents with a derived maintenance-fee lapse (dormant)
  page?: number;       // 0-based
  pageSize?: number;
};

// Correlated EXISTS on the derived `maintenance_lapsed` FACT (never on the raw event code, so a
// reinstated patent is correctly excluded). Facts JSON-encode booleans, so the value is 'true'.
const DORMANT_EXISTS =
  `EXISTS (SELECT 1 FROM asset a JOIN fact f ON f.asset_id = a.id
           WHERE a.external_id = patent_index.number
             AND f.key = 'maintenance_lapsed' AND f.value = 'true')`;

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
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params: params as InArgs };
}

export async function searchLocalIndex(f: IndexFilters): Promise<{ total: number; rows: IndexRow[] }> {
  const { sql, params } = where(f);
  const totalRow = await get<{ n: number }>(`SELECT COUNT(*) n FROM patent_index ${sql}`, params);
  const total = Number(totalRow?.n ?? 0);
  const pageSize = Math.min(f.pageSize ?? 25, 100);
  const offset = Math.max(0, f.page ?? 0) * pageSize;
  // Un-enriched-but-newer patents first is unhelpful; order by number so paging is stable.
  const rows = await all<IndexRow>(
    `SELECT number, grant_year, title, assignee, enriched FROM patent_index
     ${sql} ORDER BY number LIMIT ? OFFSET ?`,
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
