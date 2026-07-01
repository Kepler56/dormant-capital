// db/queries.ts
// Why: a thin typed gateway over SQL so the rest of the app never writes raw SQL or
// touches JSON (de)serialization. Values are JSON-encoded on write and decoded on
// read, so callers work with real objects while the DB stays simple.
import { db } from "./connection";
import type { FactRow, JudgmentRow, EventRow, NewFact, NewJudgment } from "@/lib/types";

export function upsertAsset(externalId: string, assetType = "patent"): number {
  db.prepare(
    `INSERT OR IGNORE INTO asset (asset_type, external_id) VALUES (?, ?)`
  ).run(assetType, externalId);
  const row = db.prepare(
    `SELECT id FROM asset WHERE asset_type=? AND external_id=?`
  ).get(assetType, externalId) as { id: number };
  return row.id;
}

// Non-creating lookup: returns asset id if it exists, null otherwise.
// Used to check whether a patent is loaded locally without creating orphan rows.
export function findAssetId(externalId: string, assetType = "patent"): number | null {
  const row = db.prepare(
    `SELECT id FROM asset WHERE asset_type=? AND external_id=?`
  ).get(assetType, externalId) as { id: number } | undefined;
  return row?.id ?? null;
}

export function listAssets(): { id: number; external_id: string; created_at: string }[] {
  return db.prepare(`SELECT id, external_id, created_at FROM asset ORDER BY id DESC`).all() as never;
}

export function insertFact(assetId: number, f: NewFact): void {
  db.prepare(
    `INSERT INTO fact (asset_id, key, value, source, source_url, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(assetId, f.key, JSON.stringify(f.value), f.source, f.sourceUrl, f.retrievedAt);
}

export function getFacts(assetId: number): FactRow[] {
  const rows = db.prepare(`SELECT * FROM fact WHERE asset_id=? ORDER BY id`).all(assetId) as never[];
  return (rows as any[]).map((r) => ({ ...r, value: JSON.parse(r.value) }));
}

export function insertJudgment(assetId: number, j: NewJudgment): void {
  db.prepare(
    `INSERT INTO judgment (asset_id, dimension, sub_dimension, score, confidence, rationale, flags, sources, model_version, prompt_version)
     VALUES (@asset_id, @dimension, @sub_dimension, @score, @confidence, @rationale, @flags, @sources, @model_version, @prompt_version)`
  ).run({
    asset_id: assetId, dimension: j.dimension, sub_dimension: j.subDimension,
    score: j.score ?? null, confidence: j.confidence ?? null, rationale: j.rationale ?? null,
    flags: JSON.stringify(j.flags ?? null), sources: JSON.stringify(j.sources ?? null),
    model_version: j.modelVersion, prompt_version: j.promptVersion,
  });
}

export function getJudgments(assetId: number): JudgmentRow[] {
  const rows = db.prepare(`SELECT * FROM judgment WHERE asset_id=? ORDER BY id`).all(assetId) as never[];
  return (rows as any[]).map((r) => ({ ...r, flags: JSON.parse(r.flags), sources: JSON.parse(r.sources) }));
}

export function appendEvent(type: string, assetId: number | null, payload: unknown): void {
  db.prepare(`INSERT INTO event_log (event_type, asset_id, payload) VALUES (?, ?, ?)`)
    .run(type, assetId, JSON.stringify(payload));
}

export function getEvents(assetId: number): EventRow[] {
  const rows = db.prepare(`SELECT * FROM event_log WHERE asset_id=? ORDER BY id`).all(assetId) as never[];
  return (rows as any[]).map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

// Counts events of a type created on the local calendar day (append-only ledger helper).
export function countEventsToday(type: string): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM event_log WHERE event_type=? AND date(created_at)=date('now','localtime')`
  ).get(type) as { n: number };
  return row.n;
}

export type NewMaintenanceEvent = {
  patentNumber: string; appNumber: string | null; entityStatus: string | null;
  filingDate: string | null; grantDate: string | null; eventDate: string | null;
  eventCode: string; source: string; sourceUrl: string; retrievedAt: string;
};
export type MaintenanceEventRow = NewMaintenanceEvent & { id: number };

// Idempotent: silently ignores duplicate (patent_number, event_code, event_date) on re-insert.
export function insertMaintenanceEvents(rows: NewMaintenanceEvent[]): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO maintenance_event
       (patent_number, app_number, entity_status, filing_date, grant_date, event_date, event_code, source, source_url, retrieved_at)
     VALUES (@patentNumber, @appNumber, @entityStatus, @filingDate, @grantDate, @eventDate, @eventCode, @source, @sourceUrl, @retrievedAt)`
  );
  const tx = db.transaction((rs: NewMaintenanceEvent[]) => { for (const r of rs) stmt.run(r); });
  tx(rows);
}

export function getMaintenanceEvents(patentNumber: string): MaintenanceEventRow[] {
  return db.prepare(
    `SELECT id, patent_number AS patentNumber, app_number AS appNumber, entity_status AS entityStatus,
            filing_date AS filingDate, grant_date AS grantDate, event_date AS eventDate, event_code AS eventCode,
            source, source_url AS sourceUrl, retrieved_at AS retrievedAt
     FROM maintenance_event WHERE patent_number=? ORDER BY id`
  ).all(patentNumber) as MaintenanceEventRow[];
}
