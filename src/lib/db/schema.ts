// db/schema.ts
// Why: mirrors the canonical Python model (asset / fact / judgment / event_log).
// The fact/judgment split IS the auditability guarantee — facts are sourced and
// immutable, judgments are versioned AI hypotheses. Created idempotently so the app
// boots against a fresh database (local file, :memory:, or Turso) with no migration step.
import type { Client } from "@libsql/client";

export async function ensureSchema(db: Client): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS asset (
      id INTEGER PRIMARY KEY,
      asset_type TEXT NOT NULL DEFAULT 'patent',
      external_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(asset_type, external_id)
    );
    -- Standalone index on external_id so catalogue filters that correlate patent_index.number
    -- back to asset (e.g. "dormant only") are index lookups, not full scans.
    CREATE INDEX IF NOT EXISTS idx_asset_external ON asset(external_id);
    CREATE TABLE IF NOT EXISTS fact (
      id INTEGER PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES asset(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,            -- JSON-encoded
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      retrieved_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fact_asset ON fact(asset_id);
    CREATE TABLE IF NOT EXISTS judgment (
      id INTEGER PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES asset(id),
      dimension TEXT NOT NULL,
      sub_dimension TEXT NOT NULL,
      score REAL,
      confidence TEXT,
      rationale TEXT,
      flags TEXT,                     -- JSON
      sources TEXT,                   -- JSON
      model_version TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_judgment_asset ON judgment(asset_id);
    CREATE TABLE IF NOT EXISTS event_log (
      id INTEGER PRIMARY KEY,
      event_type TEXT NOT NULL,
      asset_id INTEGER REFERENCES asset(id),
      payload TEXT NOT NULL,          -- JSON
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_event_type ON event_log(event_type);

    -- patent_index: the BROWSABLE catalogue that backs the Patents table. It is seeded
    -- offline from a bundled list of real US patent numbers so the table is never empty
    -- and never depends on a live (rate-limited) search. Title/assignee are filled in
    -- lazily ("enriched") from the patent's Google Patents page on first view and cached
    -- here forever. grant_year is derived from the patent number (USPTO milestone anchors).
    CREATE TABLE IF NOT EXISTS patent_index (
      number TEXT PRIMARY KEY,          -- e.g. "US7123456"
      grant_year INTEGER,               -- approximate, derived from the number
      title TEXT,                       -- null until enriched
      assignee TEXT,                    -- null until enriched
      enriched INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_index_year ON patent_index(grant_year);
    CREATE TABLE IF NOT EXISTS maintenance_event (
      id INTEGER PRIMARY KEY,
      patent_number TEXT NOT NULL,
      app_number TEXT,
      entity_status TEXT,
      filing_date TEXT,
      grant_date TEXT,
      event_date TEXT,
      event_code TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      UNIQUE(patent_number, event_code, event_date)
    );
    CREATE INDEX IF NOT EXISTS idx_mfe_number ON maintenance_event(patent_number);

    -- outcome: the micro-outcome ledger (brief v2, Upgrade 2). Every step of an
    -- asset-buyer journey is one timestamped row — fifty signals per deal, not one.
    -- reason_code is MANDATORY on terminal events (Upgrade 5), enforced in queries.
    CREATE TABLE IF NOT EXISTS outcome (
      id INTEGER PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES asset(id),
      mandate_id INTEGER,
      event_type TEXT NOT NULL,
      reason_code TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_outcome_asset ON outcome(asset_id);
  `);
}
