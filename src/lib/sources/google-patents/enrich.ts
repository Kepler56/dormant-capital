// sources/google-patents/enrich.ts
// Why: fills in a catalogue row's title/assignee on demand. Browsing relies on the
// bundled numbers; this turns a bare number into a readable row by scraping just enough
// from the patent's Google Patents PAGE (which is far less rate-limited than the search
// XHR endpoint). It is best-effort and cached: a failure leaves the row un-enriched and
// the UI simply shows the number. Unlike full ingestion it does NOT persist raw HTML or
// write facts — it only updates the lightweight index.
import * as cheerio from "cheerio";
import { patentUrl } from "./fetch";
import { updateIndexMeta } from "@/lib/index/queries";
import { db } from "@/lib/db/connection";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type EnrichResult = { number: string; ok: boolean; title?: string | null; assignee?: string | null };

export async function enrichPatent(number: string): Promise<EnrichResult> {
  // Short-circuit: rows already enriched by the bulk loader never need a network round-trip.
  const existing = db.prepare("SELECT title, assignee, enriched FROM patent_index WHERE number=?").get(number) as
    { title: string | null; assignee: string | null; enriched: number } | undefined;
  if (existing?.enriched) return { number, ok: true, title: existing.title, assignee: existing.assignee };

  let title: string | null = null;
  let assignee: string | null = null;
  try {
    const res = await fetch(patentUrl(number), {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return { number, ok: false };
    const $ = cheerio.load(await res.text());
    const meta = (name: string) => $(`meta[name="${name}"]`).first().attr("content")?.trim() || null;
    title = meta("DC.title");
    // DC.contributor lists inventors then the assignee; the assignee carries scheme="assignee".
    assignee = $('meta[name="DC.contributor"][scheme="assignee"]').first().attr("content")?.trim()
      ?? meta("citation_assignee") ?? null;
  } catch {
    return { number, ok: false };
  }
  // DB write is outside the fetch try/catch so a write failure doesn't silently turn a
  // successful scrape into ok:false — the caller still gets ok:true and the error is thrown.
  updateIndexMeta(number, title, assignee);
  return { number, ok: true, title, assignee };
}

// Enrich a batch with light concurrency so a visible page fills in quickly without
// hammering Google Patents (which would invite the very 503s we're avoiding).
export async function enrichBatch(numbers: string[]): Promise<EnrichResult[]> {
  const out: EnrichResult[] = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < numbers.length; i += CONCURRENCY) {
    const slice = numbers.slice(i, i + CONCURRENCY);
    out.push(...(await Promise.all(slice.map(enrichPatent))));
  }
  return out;
}
