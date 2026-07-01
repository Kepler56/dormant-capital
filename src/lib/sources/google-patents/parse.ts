// sources/google-patents/parse.ts
// Why: turn one raw Google Patents page into our ParsedPatent shape. We read the
// stable <meta> tags for bibliographic facts (Google emits DC.* tags for this older
// pre-2001 patent) and walk the "Legal Events" rows for the dormancy hero signal —
// distinguishing an owner who STOPPED PAYING maintenance fees (abandonment) from a
// patent that simply reached full term ("anticipated expiration"). Parsing is
// defensive: pre-2001 grants like VRFB omit many fields, and a missing field must
// yield null, not a crash.
//
// SELECTOR NOTES (verified against real us4786567.html fixture):
//   - Title:     <meta name="DC.title" content="..."> (with trailing whitespace — trimmed)
//   - Abstract:  <meta name="DC.description" content="..."> (with leading newline — trimmed)
//   - Inventors: <meta name="DC.contributor" content="..."> (multiple, last one is assignee)
//   - Dates:     <meta name="DC.date" content="..."> (multiple: filing + grant)
//   - Legal events: <tr itemprop="legalEvents"> with nested <time itemprop="date">,
//                   <td itemprop="code">, <td itemprop="title">
//   - citation_* tags (filing_date, assignee, cpc, etc.) are NOT present for this older
//     patent — only DC.* and a few citation_patent_* tags exist.
import * as cheerio from "cheerio";
import type { ParsedPatent } from "@/lib/types";

const metaAll = ($: cheerio.CheerioAPI, name: string): string[] =>
  $(`meta[name="${name}"]`).map((_, el) => $(el).attr("content") ?? "").get().filter(Boolean);
const meta = ($: cheerio.CheerioAPI, name: string): string | null => metaAll($, name)[0] ?? null;

// USPTO maintenance-fee lapse codes seen in Google Patents legal events. "Fee related"
// expiry / "failure to pay" = owner abandonment. We match on text, not just codes,
// because Google renders both a code and a human description.
const LAPSE_RE = /failure to pay|fee related|lapse|expired due to/i;
const ANTICIPATED_RE = /anticipated expiration/i;

export function parsePatent(html: string, patentNumber: string): ParsedPatent {
  const $ = cheerio.load(html);

  // Legal events: each row has a date (time[itemprop=date] datetime attr), a code
  // (td[itemprop=code]), and a title/description (td[itemprop=title]).
  const legalEvents = $("tr[itemprop='legalEvents']").map((_, el) => {
    const tds = $(el).find("td");
    return {
      date: $(el).find("time[itemprop='date']").attr("datetime") ?? $(tds[0]).text().trim(),
      code: $(el).find("[itemprop='code']").text().trim() || $(tds[1]).text().trim(),
      description: $(el).find("[itemprop='title']").text().trim() || $(tds[2]).text().trim(),
    };
  }).get().filter((e) => e.date || e.description);

  // "Anticipated expiration" lives in <dd itemprop="events"> nodes (not legalEvents rows),
  // with the description in <span itemprop="title">. Scan those separately so full-term
  // patents like VRFB are correctly flagged.
  const eventItems = $("[itemprop='events']")
    .map((_, el) => ({
      description: $(el).find("[itemprop='title']").text().trim() || $(el).text().trim(),
    }))
    .get();

  // The hero signal: an owner-abandonment lapse event that is NOT a full-term expiry.
  // maintenanceLapsed intentionally stays on legalEvents rows only (structured fee data).
  const maintenanceLapsed = legalEvents.some(
    (e) => LAPSE_RE.test(e.description) && !ANTICIPATED_RE.test(e.description)
  );
  const anticipatedExpiration =
    legalEvents.some((e) => ANTICIPATED_RE.test(e.description)) ||
    eventItems.some((e) => ANTICIPATED_RE.test(e.description));

  const toInt = (s: string | null) => (s && /\d/.test(s) ? parseInt(s.replace(/\D/g, ""), 10) : null);

  // DC.contributor lists inventors first, then the assignee (last entry). For older
  // patents the citation_assignee tag is absent so we use the last DC.contributor.
  const contributors = metaAll($, "DC.contributor");
  const assignee = contributors.length > 0 ? contributors[contributors.length - 1] : null;
  // Inventors are all contributors except the last (assignee). If only one entry
  // exists it is the assignee (no inventor names available), so inventors = [].
  const inventors = contributors.length > 1 ? contributors.slice(0, -1) : [];

  // DC.date is multi-valued: first is typically filing date, second is grant date.
  const dcDates = metaAll($, "DC.date");

  return {
    patentNumber,
    // DC.title content may contain trailing whitespace/newlines — always trim.
    title: meta($, "DC.title")?.trim() || $("title").text()?.trim() || null,
    // DC.description content may have a leading newline — trim.
    abstract: meta($, "DC.description")?.trim() || meta($, "description")?.trim() || null,
    assignee: meta($, "citation_assignee") ?? assignee,
    inventors,
    filingDate: meta($, "citation_filing_date") ?? dcDates[0] ?? null,
    grantDate: meta($, "citation_date") ?? dcDates[1] ?? null,
    priorityDate: meta($, "citation_priority_date") ?? null,
    expiryDate: meta($, "citation_expiration_date") ?? null,
    cpcClasses: metaAll($, "citation_cpc"),
    forwardCitations: toInt(meta($, "citation_num_cited_by")),
    backwardCitations: toInt(meta($, "citation_num_references")),
    legalEvents,
    maintenanceLapsed,
    anticipatedExpiration,
  };
}
