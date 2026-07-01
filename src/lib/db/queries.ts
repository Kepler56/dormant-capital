// db/queries.ts
// Why: a thin typed gateway over SQL so the rest of the app never writes raw SQL or
// touches JSON (de)serialization. Values are JSON-encoded on write and decoded on
// read, so callers work with real objects while the DB stays simple. Every function is
// async because the underlying libSQL client is network-async (see ./connection).
import { all, get, run, batch } from "./connection";
import type { FactRow, JudgmentRow, EventRow, NewFact, NewJudgment } from "@/lib/types";

export async function upsertAsset(externalId: string, assetType = "patent"): Promise<number> {
  await run(`INSERT OR IGNORE INTO asset (asset_type, external_id) VALUES (?, ?)`, [assetType, externalId]);
  const row = await get<{ id: number }>(
    `SELECT id FROM asset WHERE asset_type=? AND external_id=?`, [assetType, externalId]
  );
  return Number(row!.id);
}

// Non-creating lookup: returns asset id if it exists, null otherwise.
// Used to check whether a patent is loaded locally without creating orphan rows.
export async function findAssetId(externalId: string, assetType = "patent"): Promise<number | null> {
  const row = await get<{ id: number }>(
    `SELECT id FROM asset WHERE asset_type=? AND external_id=?`, [assetType, externalId]
  );
  return row ? Number(row.id) : null;
}

export async function listAssets(): Promise<{ id: number; external_id: string; created_at: string }[]> {
  return all(`SELECT id, external_id, created_at FROM asset ORDER BY id DESC`);
}

export async function insertFact(assetId: number, f: NewFact): Promise<void> {
  await run(
    `INSERT INTO fact (asset_id, key, value, source, source_url, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [assetId, f.key, JSON.stringify(f.value), f.source, f.sourceUrl, f.retrievedAt]
  );
}

export async function getFacts(assetId: number): Promise<FactRow[]> {
  const rows = await all<Record<string, unknown>>(`SELECT * FROM fact WHERE asset_id=? ORDER BY id`, [assetId]);
  return rows.map((r) => ({ ...r, value: JSON.parse(r.value as string) })) as FactRow[];
}

export async function insertJudgment(assetId: number, j: NewJudgment): Promise<void> {
  await run(
    `INSERT INTO judgment (asset_id, dimension, sub_dimension, score, confidence, rationale, flags, sources, model_version, prompt_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      assetId, j.dimension, j.subDimension, j.score ?? null, j.confidence ?? null, j.rationale ?? null,
      JSON.stringify(j.flags ?? null), JSON.stringify(j.sources ?? null), j.modelVersion, j.promptVersion,
    ]
  );
}

export async function getJudgments(assetId: number): Promise<JudgmentRow[]> {
  const rows = await all<Record<string, unknown>>(`SELECT * FROM judgment WHERE asset_id=? ORDER BY id`, [assetId]);
  return rows.map((r) => ({ ...r, flags: JSON.parse(r.flags as string), sources: JSON.parse(r.sources as string) })) as JudgmentRow[];
}

export async function appendEvent(type: string, assetId: number | null, payload: unknown): Promise<void> {
  await run(`INSERT INTO event_log (event_type, asset_id, payload) VALUES (?, ?, ?)`, [type, assetId, JSON.stringify(payload)]);
}

export async function getEvents(assetId: number): Promise<EventRow[]> {
  const rows = await all<Record<string, unknown>>(`SELECT * FROM event_log WHERE asset_id=? ORDER BY id`, [assetId]);
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload as string) })) as EventRow[];
}

// Counts events of a type created on the local calendar day (append-only ledger helper).
export async function countEventsToday(type: string): Promise<number> {
  const row = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM event_log WHERE event_type=? AND date(created_at)=date('now','localtime')`, [type]
  );
  return Number(row!.n);
}

export type NewMaintenanceEvent = {
  patentNumber: string; appNumber: string | null; entityStatus: string | null;
  filingDate: string | null; grantDate: string | null; eventDate: string | null;
  eventCode: string; source: string; sourceUrl: string; retrievedAt: string;
};
export type MaintenanceEventRow = NewMaintenanceEvent & { id: number };

// Idempotent: silently ignores duplicate (patent_number, event_code, event_date) on re-insert.
// Written as one atomic libSQL batch.
export async function insertMaintenanceEvents(rows: NewMaintenanceEvent[]): Promise<void> {
  if (rows.length === 0) return;
  await batch(
    rows.map((r) => ({
      sql: `INSERT OR IGNORE INTO maintenance_event
              (patent_number, app_number, entity_status, filing_date, grant_date, event_date, event_code, source, source_url, retrieved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [r.patentNumber, r.appNumber, r.entityStatus, r.filingDate, r.grantDate, r.eventDate, r.eventCode, r.source, r.sourceUrl, r.retrievedAt],
    }))
  );
}

export async function getMaintenanceEvents(patentNumber: string): Promise<MaintenanceEventRow[]> {
  return all(
    `SELECT id, patent_number AS patentNumber, app_number AS appNumber, entity_status AS entityStatus,
            filing_date AS filingDate, grant_date AS grantDate, event_date AS eventDate, event_code AS eventCode,
            source, source_url AS sourceUrl, retrieved_at AS retrievedAt
     FROM maintenance_event WHERE patent_number=? ORDER BY id`,
    [patentNumber]
  );
}
