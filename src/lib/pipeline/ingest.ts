// pipeline/ingest.ts
// Why: the free, deterministic half of the system. It scrapes one patent and writes
// each parsed field as an immutable fact carrying its source + retrieval timestamp.
// Crucially this spends ZERO LLM tokens — ingestion is cheap and runs on demand so
// the expensive Analyze step (Gemini) is always an explicit, separate choice.
import { fetchPatentHtml } from "@/lib/sources/google-patents/fetch";
import { parsePatent } from "@/lib/sources/google-patents/parse";
import { upsertAsset, insertFact, appendEvent, getMaintenanceEvents, getFacts, findAssetId } from "@/lib/db/queries";
import type { ParsedPatent } from "@/lib/types";

const EMPTY_PARSED = (num: string): ParsedPatent => ({
  patentNumber: num, title: null, abstract: null, assignee: null, inventors: [],
  filingDate: null, grantDate: null, priorityDate: null, expiryDate: null, cpcClasses: [],
  forwardCitations: null, backwardCitations: null, legalEvents: [],
  maintenanceLapsed: false, anticipatedExpiration: false,
});

// Local-first: if the bulk loader already populated this patent, skip the network entirely.
// We treat "has any maintenance_event OR any fact" as "loaded locally".
export async function localIngestPatent(num: string): Promise<{ assetId: number } | null> {
  const assetId = await findAssetId(num);
  if (assetId == null) return null;            // not loaded locally — no side effects
  const hasEvents = (await getMaintenanceEvents(num)).length > 0;
  const hasFacts = (await getFacts(assetId)).length > 0;
  return hasEvents || hasFacts ? { assetId } : null;
}

export async function ingestPatent(num: string): Promise<{ assetId: number; parsed: ParsedPatent }> {
  const local = await localIngestPatent(num);
  if (local) {
    const facts = await getFacts(local.assetId);
    const lapsed = facts.find((f) => f.key === "maintenance_lapsed")?.value === true;
    const parsed = { ...EMPTY_PARSED(num), maintenanceLapsed: lapsed } as ParsedPatent;
    return { assetId: local.assetId, parsed };
  }

  const { html, url } = await fetchPatentHtml(num);
  const parsed = parsePatent(html, num);
  const assetId = await upsertAsset(num);
  const now = new Date().toISOString();

  // Each ParsedPatent field becomes one fact row. We store the value as-is and attach
  // the same source/url/timestamp so the audit trail is uniform across fields.
  let factCount = 0;
  const write = async (key: string, value: unknown) => {
    if (value != null && (!Array.isArray(value) || value.length)) {
      await insertFact(assetId, { key, value, source: "google_patents", sourceUrl: url, retrievedAt: now });
      factCount++;
    }
  };

  await write("title", parsed.title);
  await write("abstract", parsed.abstract);
  await write("assignee", parsed.assignee);
  await write("inventors", parsed.inventors);
  await write("filing_date", parsed.filingDate);
  await write("grant_date", parsed.grantDate);
  await write("priority_date", parsed.priorityDate);
  await write("expiry_date", parsed.expiryDate);
  await write("cpc_classes", parsed.cpcClasses);
  await write("forward_citations", parsed.forwardCitations);
  await write("backward_citations", parsed.backwardCitations);
  await write("legal_events", parsed.legalEvents);
  await write("maintenance_lapsed", parsed.maintenanceLapsed);
  await write("anticipated_expiration", parsed.anticipatedExpiration);

  await appendEvent("ingested", assetId, { patentNumber: num, factCount, source: url });
  return { assetId, parsed };
}
