// scoring/signals.ts
// Why: shared, deterministic date-math over parsed FACTS (never LLM output). Both the
// dormancy gate (stale-lapse bonus) and Gate 0 (term remaining, restoration window)
// read these; keeping them here means the two gates can never disagree about a date.
import type { ParsedPatent } from "@/lib/types";

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** Years since the most recent maintenance-lapse legal event; null if none is dated. */
export function yearsSinceLapse(p: ParsedPatent, now: Date = new Date()): number | null {
  // Defensive: some callers build a ParsedPatent via `as ParsedPatent` from a partial
  // shape (e.g. USPTO ingest regression tests feeding only the derived facts). Treat a
  // missing legalEvents array as "no lapse events on record" rather than crashing.
  const lapses = (p.legalEvents ?? []).filter(
    (e) => e.code.toUpperCase().startsWith("EXP") || /expir/i.test(e.description)
  ).filter((e) => e.date && !Number.isNaN(Date.parse(e.date)));
  if (lapses.length === 0) return null;
  const latest = Math.max(...lapses.map((e) => Date.parse(e.date)));
  return (now.getTime() - latest) / YEAR_MS;
}

/** Years of patent term remaining: expiryDate if known, else filing + 20y; null if undatable. */
export function yearsRemaining(p: ParsedPatent, now: Date = new Date()): number | null {
  let end: number | null = null;
  if (p.expiryDate && !Number.isNaN(Date.parse(p.expiryDate))) end = Date.parse(p.expiryDate);
  else if (p.filingDate && !Number.isNaN(Date.parse(p.filingDate))) {
    const d = new Date(p.filingDate); d.setFullYear(d.getFullYear() + 20); end = d.getTime();
  }
  if (end === null) return null;
  return (end - now.getTime()) / YEAR_MS;
}
