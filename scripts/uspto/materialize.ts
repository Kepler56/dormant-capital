// scripts/uspto/materialize.ts
// Why: the single place that turns parsed bulk data into DB rows, preserving the
// facts/judgments split — every fact carries source + url + retrieved_at, and
// maintenance_lapsed is DERIVED in code (never an LLM). Reuses the app's query gateway so
// the loader and the live app write identically-shaped rows.
import { db } from "../../src/lib/db/connection";
import { upsertAsset, insertFact, appendEvent, insertMaintenanceEvents, getFacts, type NewMaintenanceEvent } from "../../src/lib/db/queries";
import { deriveLapsed, EXP_CODE, type FeeEvent } from "./fee";

const FEE_SOURCE = "uspto_maintenance_fee_events";
const BIBLIO_SOURCE = "patentsview_bulk";

export type PatentBundle = {
  number: string; events: FeeEvent[];
  title: string | null; assignee: string | null;
  grantDate: string | null; filingDate: string | null; entityStatus: string | null; cpc: string[];
};

const CODE_DESC: Record<string, string> = {
  [EXP_CODE]: "Patent Expired for Failure to Pay Maintenance Fees",
  EXPX: "Patent Reinstated After Maintenance Fee Payment Confirmed",
};
const describeCode = (code: string) => CODE_DESC[code] ?? (/^[MF]/.test(code) ? "Maintenance fee payment" : code);

export function materializePatent(b: PatentBundle, urls: { fee: string; gPatent: string; assignee: string; cpc: string }, retrievedAt: string): void {
  const externalNumber = `US${b.number}`;
  const codes = b.events.map((e) => e.eventCode);
  const lapsed = deriveLapsed(codes);

  // 1. raw events
  const eventRows: NewMaintenanceEvent[] = b.events.map((e) => ({
    patentNumber: externalNumber, appNumber: e.appNumber || null, entityStatus: e.entityStatus,
    filingDate: e.filingDate, grantDate: e.grantDate, eventDate: e.eventDate, eventCode: e.eventCode,
    source: FEE_SOURCE, sourceUrl: urls.fee, retrievedAt,
  }));
  insertMaintenanceEvents(eventRows);

  // 2. enriched index row (real grant year from grant date)
  const year = b.grantDate ? parseInt(b.grantDate.slice(0, 4), 10) : null;
  db.prepare(
    `INSERT INTO patent_index (number, grant_year, title, assignee, enriched, updated_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(number) DO UPDATE SET grant_year=excluded.grant_year, title=excluded.title,
       assignee=excluded.assignee, enriched=1, updated_at=excluded.updated_at`
  ).run(externalNumber, Number.isFinite(year as number) ? year : null, b.title, b.assignee);

  // 3. asset + immutable facts (idempotent: skip if facts already exist)
  const assetId = upsertAsset(externalNumber);
  if (getFacts(assetId).length === 0) {
    const legalEvents = b.events.map((e) => ({ date: e.eventDate ?? "", code: e.eventCode, description: describeCode(e.eventCode) }));
    const fact = (key: string, value: unknown, source: string, url: string) => {
      if (value != null && (!Array.isArray(value) || value.length))
        insertFact(assetId, { key, value, source, sourceUrl: url, retrievedAt });
    };
    fact("title", b.title, BIBLIO_SOURCE, urls.gPatent);
    fact("assignee", b.assignee, BIBLIO_SOURCE, urls.assignee);
    fact("grant_date", b.grantDate, BIBLIO_SOURCE, urls.gPatent);
    fact("filing_date", b.filingDate, FEE_SOURCE, urls.fee);
    fact("entity_status", b.entityStatus, FEE_SOURCE, urls.fee);
    fact("cpc_classes", b.cpc, BIBLIO_SOURCE, urls.cpc);
    fact("legal_events", legalEvents, FEE_SOURCE, urls.fee);
    // boolean fact: write unconditionally (insertFact's guard would drop `false`)
    insertFact(assetId, { key: "maintenance_lapsed", value: lapsed, source: FEE_SOURCE, sourceUrl: urls.fee, retrievedAt });

    appendEvent("loaded", assetId, { patentNumber: externalNumber, events: b.events.length, lapsed });
  }
}
