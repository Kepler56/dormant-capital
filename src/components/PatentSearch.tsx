// components/PatentSearch.tsx
// Why: client component for the local patent catalogue browser. It calls the offline
// /api/index endpoint (never touches the network), then lazily enriches un-titled rows via
// /api/enrich in the background. A row click ingests the patent (/api/ingest → local facts)
// and navigates to its verdict. Filters (keyword, assignee, grant-year range, dormant-only,
// sector, lapse recency, analysis status/route) make the ~35k loaded catalogue easy to
// search. This file must NOT import anything from @/lib/db or other server modules — all
// server work goes through fetch. `@/lib/index/sectors` is fine to import: dependency-free
// plain constants, never touches the database.
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import BatchAnalyzePanel from "./BatchAnalyzePanel";
import { SECTORS, SECTOR_KEYS } from "@/lib/index/sectors";

// Selection cap for a batch run — sequential SSE analysis of more than this gets slow and starts
// pushing into per-provider rate limits (see BatchAnalyzePanel).
const MAX_BATCH = 10;

// ─── Catalogue types (mirrors /api/index response) ───────────────────────────
type IndexRow = {
  number: string;
  grant_year: number | null;
  title: string | null;
  assignee: string | null;
  enriched: number; // 0 or 1
};

type IndexResult = { total: number; rows: IndexRow[] };

// ─── Filter state ─────────────────────────────────────────────────────────────
type Filters = {
  q: string; assignee: string; yearAfter: string; yearBefore: string;
  cpc: string; entityStatus: "" | "large" | "small" | "micro"; status: "" | "lapsed" | "maintained";
  sector: "" | keyof typeof SECTORS;
  lapseAge: "" | "recent2" | "recent5" | "stale5";
  analysis: "" | "analyzed" | "not_analyzed" | "route_license" | "route_revival" | "route_pdi" | "route_tech";
  sort: "number" | "year_desc" | "year_asc";
};
const INITIAL: Filters = {
  q: "", assignee: "", yearAfter: "", yearBefore: "",
  cpc: "", entityStatus: "", status: "",
  sector: "", lapseAge: "", analysis: "",
  sort: "number",
};

const PAGE_SIZE = 25; // server-fixed; keep in sync for the "Showing X–Y" display

function buildQS(f: Filters, page: number): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.assignee.trim()) p.set("assignee", f.assignee.trim());
  if (f.yearAfter.trim()) p.set("yearAfter", f.yearAfter.trim());
  if (f.yearBefore.trim()) p.set("yearBefore", f.yearBefore.trim());
  if (f.cpc.trim()) p.set("cpc", f.cpc.trim());
  if (f.entityStatus) p.set("entityStatus", f.entityStatus);
  if (f.status) p.set("status", f.status);
  if (f.sector) p.set("sector", f.sector);
  if (f.lapseAge) p.set("lapseAge", f.lapseAge);
  if (f.analysis) p.set("analysis", f.analysis);
  if (f.sort !== "number") p.set("sort", f.sort);
  p.set("page", String(page));
  return p.toString();
}

const ENTITY_STATUS_VALUES = new Set(["large", "small", "micro"]);
const STATUS_VALUES = new Set(["lapsed", "maintained"]);
const SECTOR_VALUES = new Set<string>(SECTOR_KEYS);
const LAPSE_AGE_VALUES = new Set(["recent2", "recent5", "stale5"]);
const ANALYSIS_VALUES = new Set([
  "analyzed", "not_analyzed", "route_license", "route_revival", "route_pdi", "route_tech",
]);
const SORT_VALUES = new Set(["number", "year_desc", "year_asc"]);

// Inverse of buildQS: parse a URL's query params back into { filters, page }, falling back to
// INITIAL/0 for anything missing or invalid (bogus enum values, non-numeric page). One
// vocabulary shared by fetch and address bar, so the URL is always a faithful round-trip.
function filtersFromParams(sp: URLSearchParams): { filters: Filters; page: number } {
  const entityStatus = sp.get("entityStatus") ?? "";
  const status = sp.get("status") ?? "";
  const sector = sp.get("sector") ?? "";
  const lapseAge = sp.get("lapseAge") ?? "";
  const analysis = sp.get("analysis") ?? "";
  const sort = sp.get("sort") ?? "number";
  const filters: Filters = {
    q: sp.get("q") ?? "",
    assignee: sp.get("assignee") ?? "",
    yearAfter: sp.get("yearAfter") ?? "",
    yearBefore: sp.get("yearBefore") ?? "",
    cpc: sp.get("cpc") ?? "",
    entityStatus: ENTITY_STATUS_VALUES.has(entityStatus) ? (entityStatus as Filters["entityStatus"]) : "",
    status: STATUS_VALUES.has(status) ? (status as Filters["status"]) : "",
    sector: SECTOR_VALUES.has(sector) ? (sector as Filters["sector"]) : "",
    lapseAge: LAPSE_AGE_VALUES.has(lapseAge) ? (lapseAge as Filters["lapseAge"]) : "",
    analysis: ANALYSIS_VALUES.has(analysis) ? (analysis as Filters["analysis"]) : "",
    sort: SORT_VALUES.has(sort) ? (sort as Filters["sort"]) : "number",
  };
  const rawPage = sp.get("page");
  const parsedPage = rawPage === null ? 0 : Number.parseInt(rawPage, 10);
  const page = Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;
  return { filters, page };
}

const INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft";

// ─── Main component ───────────────────────────────────────────────────────────
export default function PatentSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Seeds first paint from the URL present at mount. NOT the only entry path any more: the
  // App Router does not remount this component for same-segment navigation (e.g. the sidebar
  // "Patents" link while already on a filtered /patents?...), and Back/Forward between two
  // /patents?... history entries only changes searchParams — neither remounts us. The effect
  // below watches searchParams for exactly that case and resyncs filters/pending/page/table.
  const [initial] = useState(() => filtersFromParams(searchParams));

  // Canonical query string (via buildQS) that THIS component itself last wrote to the URL,
  // updated at every router.replace() call below. The searchParams-watching effect compares
  // the incoming params against this ref to tell "we navigated here from outside" (sidebar
  // link, Back/Forward) apart from our own write echoing back through useSearchParams().
  const lastSelfWrittenQS = useRef(buildQS(initial.filters, initial.page));

  // `filters` is what the current results reflect; `pending` is the in-progress form.
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [pending, setPending] = useState<Filters>(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [result, setResult] = useState<IndexResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overlay: patent number → { title, assignee } patched in after a background enrich, kept
  // separate from `result` so individual rows update without a full re-fetch.
  const [enrichPatch, setEnrichPatch] = useState<
    Record<string, { title: string | null; assignee: string | null; ok: boolean }>
  >({});
  const enrichingRef = useRef<Set<string>>(new Set());

  // Per-row ingest state: patent number → "loading" | "error" | null.
  const [rowState, setRowState] = useState<Record<string, "loading" | "error" | null>>({});

  // Batch selection: patent numbers checked for a multi-patent analyze run. Persists across
  // pagination/filter changes so a user can build a batch while browsing several result pages.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);

  // ── Catalogue fetch ────────────────────────────────────────────────────────
  const run = useCallback(async (f: Filters, p: number) => {
    setLoading(true);
    setError(null);
    setEnrichPatch({});
    enrichingRef.current.clear();
    try {
      const res = await fetch(`/api/index?${buildQS(f, p)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult((await res.json()) as IndexResult);
    } catch {
      setError("Could not load the local catalogue. Please refresh.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch once on mount using the filters/page parsed from the URL (or INITIAL/0 if bare).
  // `initial` is stable for the lifetime of this component instance (see useState above), so
  // this effect fires exactly once for the mount fetch — external navigation is handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(initial.filters, initial.page); }, [run]);

  // Resync on external navigation: same-segment nav (e.g. clicking the sidebar "Patents" link
  // while already on a filtered /patents?...) and Back/Forward between two /patents?... history
  // entries both change searchParams without remounting this component. When the incoming params
  // canonicalize to something other than the last query string we ourselves wrote, treat it as
  // external and re-parse/re-run; when they match, it's our own router.replace() echoing back, so
  // skip it to avoid double-fetching our own searches.
  useEffect(() => {
    const parsed = filtersFromParams(searchParams);
    const canonical = buildQS(parsed.filters, parsed.page);
    if (canonical === lastSelfWrittenQS.current) return;
    lastSelfWrittenQS.current = canonical;
    setFilters(parsed.filters);
    setPending(parsed.filters);
    setPage(parsed.page);
    run(parsed.filters, parsed.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Lazy enrich: after a page renders, POST the unenriched numbers ───────────
  useEffect(() => {
    if (!result) return;
    const toEnrich = result.rows
      .filter((r) => r.enriched === 0 && !enrichPatch[r.number] && !enrichingRef.current.has(r.number))
      .map((r) => r.number);
    if (toEnrich.length === 0) return;
    toEnrich.forEach((n) => enrichingRef.current.add(n));
    fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: toEnrich }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.results) return;
        const patch: typeof enrichPatch = {};
        for (const item of data.results as Array<{ number: string; ok: boolean; title?: string; assignee?: string }>) {
          patch[item.number] = {
            ok: item.ok,
            title: item.ok ? (item.title ?? null) : null,
            assignee: item.ok ? (item.assignee ?? null) : null,
          };
        }
        setEnrichPatch((prev) => ({ ...prev, ...patch }));
      })
      .catch(() => {/* best-effort: enrich failures leave rows as their bare number */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // enrichPatch is intentionally excluded — including it would re-trigger on every row
    // enrich and loop. `result` is the only real dependency (a new page needs a new pass).
  }, [result]);

  // ── Ingest + navigate ───────────────────────────────────────────────────────
  async function handleRowClick(patentNumber: string) {
    if (!patentNumber || rowState[patentNumber] === "loading") return;
    setRowState((s) => ({ ...s, [patentNumber]: "loading" }));
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers: [patentNumber] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const first = data?.results?.[0];
      if (first?.ok && first?.assetId) router.push(`/patents/${first.assetId}`);
      else throw new Error(first?.error ?? "ok=false");
    } catch {
      setRowState((s) => ({ ...s, [patentNumber]: "error" }));
      setTimeout(() => setRowState((s) => ({ ...s, [patentNumber]: null })), 5000);
    }
  }

  // ── Selection (batch analyze) ────────────────────────────────────────────────
  function toggleRow(num: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= MAX_BATCH) return prev; // at cap — ignore further checks
        next.add(num);
      } else {
        next.delete(num);
      }
      return next;
    });
  }
  function toggleAllOnPage() {
    const pageNums = rows.map((r) => r.number);
    const allSelected = pageNums.length > 0 && pageNums.every((n) => selected.has(n));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const n of pageNums) next.delete(n);
      } else {
        for (const n of pageNums) {
          if (next.size >= MAX_BATCH) break;
          next.add(n);
        }
      }
      return next;
    });
  }

  // ── Event handlers ───────────────────────────────────────────────────────────
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilters(pending);
    setPage(0);
    run(pending, 0);
    lastSelfWrittenQS.current = buildQS(pending, 0);
    router.replace(`${pathname}?${buildQS(pending, 0)}`, { scroll: false });
  }
  function handleReset() {
    setPending(INITIAL);
    setFilters(INITIAL);
    setPage(0);
    run(INITIAL, 0);
    // Written bare (no query string), but that URL parses back to INITIAL/0 — same canonical
    // form recorded here — so the searchParams watcher recognizes this as our own write.
    lastSelfWrittenQS.current = buildQS(INITIAL, 0);
    router.replace(pathname, { scroll: false });
  }
  function prev() {
    const p = Math.max(0, page - 1);
    setPage(p);
    run(filters, p);
    lastSelfWrittenQS.current = buildQS(filters, p);
    router.replace(`${pathname}?${buildQS(filters, p)}`, { scroll: false });
  }
  function next() {
    const p = page + 1;
    setPage(p);
    run(filters, p);
    lastSelfWrittenQS.current = buildQS(filters, p);
    router.replace(`${pathname}?${buildQS(filters, p)}`, { scroll: false });
  }

  function showingLabel(total: number, p: number, rowCount: number): string {
    const from = p * PAGE_SIZE + 1;
    const to = p * PAGE_SIZE + rowCount;
    return `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`;
  }

  // ── Resolved title/assignee (enrich overlay > raw value) ─────────────────────
  function resolvedTitle(row: IndexRow): React.ReactNode {
    if (row.enriched === 1 && row.title) return <span className="text-ink">{row.title}</span>;
    const patch = enrichPatch[row.number];
    if (patch) {
      if (patch.ok && patch.title) return <span className="text-ink">{patch.title}</span>;
      return <span className="text-xs italic text-muted">— (open to load)</span>;
    }
    return <span className="inline-block h-3 w-48 animate-pulse rounded bg-line align-middle" />;
  }
  function resolvedAssignee(row: IndexRow): React.ReactNode {
    if (row.enriched === 1 && row.assignee) return row.assignee;
    const patch = enrichPatch[row.number];
    if (patch?.ok && patch.assignee) return patch.assignee;
    if (patch && !patch.ok) return <span className="text-muted">—</span>;
    if (row.enriched === 0 && !patch)
      return <span className="inline-block h-3 w-24 animate-pulse rounded bg-line align-middle" />;
    return <span className="text-muted">—</span>;
  }

  function ActionCell({ num }: { num: string }) {
    const s = rowState[num];
    if (s === "loading") return <span className="text-xs text-muted">Opening…</span>;
    if (s === "error") return <span className="text-xs text-amber-600">Couldn&apos;t open — try again.</span>;
    return <span className="text-xs font-semibold text-action">Open →</span>;
  }

  const rows = result?.rows ?? [];

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="mt-6 space-y-4">
      {/* Filter card */}
      <form onSubmit={handleSearch} className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted">Keyword</label>
            <input type="text" value={pending.q} onChange={(e) => setPending((f) => ({ ...f, q: e.target.value }))}
              placeholder="Number, title, or keyword" className={INPUT} />
          </div>
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted">Assignee</label>
            <input type="text" value={pending.assignee} onChange={(e) => setPending((f) => ({ ...f, assignee: e.target.value }))}
              placeholder="e.g. IBM" className={INPUT} />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs font-semibold text-muted">Year from</label>
            <input type="number" value={pending.yearAfter} onChange={(e) => setPending((f) => ({ ...f, yearAfter: e.target.value }))}
              placeholder="1985" min={1900} max={2100} className={INPUT} />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs font-semibold text-muted">Year to</label>
            <input type="number" value={pending.yearBefore} onChange={(e) => setPending((f) => ({ ...f, yearBefore: e.target.value }))}
              placeholder="2005" min={1900} max={2100} className={INPUT} />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs font-semibold text-muted">CPC class</label>
            <input type="text" value={pending.cpc} onChange={(e) => setPending((f) => ({ ...f, cpc: e.target.value }))}
              placeholder="e.g. H01L" className={INPUT} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-xs font-semibold text-muted">Status</label>
            <select value={pending.status}
              onChange={(e) => setPending((f) => ({ ...f, status: e.target.value as Filters["status"] }))}
              className={INPUT}>
              <option value="">Any status</option>
              <option value="lapsed">Dormant — fee lapsed</option>
              <option value="maintained">Maintained</option>
            </select>
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-semibold text-muted">Entity status</label>
            <select value={pending.entityStatus}
              onChange={(e) => setPending((f) => ({ ...f, entityStatus: e.target.value as Filters["entityStatus"] }))}
              className={INPUT}>
              <option value="">Any</option>
              <option value="large">Large entity</option>
              <option value="small">Small entity</option>
              <option value="micro">Micro entity</option>
            </select>
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-semibold text-muted">Sort</label>
            <select value={pending.sort}
              onChange={(e) => setPending((f) => ({ ...f, sort: e.target.value as Filters["sort"] }))}
              className={INPUT}>
              <option value="number">Patent number</option>
              <option value="year_desc">Newest first</option>
              <option value="year_asc">Oldest first</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-52">
            <label className="mb-1 block text-xs font-semibold text-muted">Sector</label>
            <select value={pending.sector}
              onChange={(e) => setPending((f) => ({ ...f, sector: e.target.value as Filters["sector"] }))}
              className={INPUT}>
              <option value="">Any sector</option>
              {SECTOR_KEYS.map((key) => (
                <option key={key} value={key}>{SECTORS[key].label}</option>
              ))}
            </select>
          </div>
          <div className="w-52">
            <label className="mb-1 block text-xs font-semibold text-muted">Lapse age</label>
            <select value={pending.lapseAge}
              onChange={(e) => setPending((f) => ({ ...f, lapseAge: e.target.value as Filters["lapseAge"] }))}
              className={INPUT}>
              <option value="">Any</option>
              <option value="recent2">≤ 2 years (revival window)</option>
              <option value="recent5">≤ 5 years</option>
              <option value="stale5">5+ years old</option>
            </select>
          </div>
          <div className="w-56">
            <label className="mb-1 block text-xs font-semibold text-muted">Analysis</label>
            <select value={pending.analysis}
              onChange={(e) => setPending((f) => ({ ...f, analysis: e.target.value as Filters["analysis"] }))}
              className={INPUT}>
              <option value="">Any</option>
              <option value="analyzed">Analyzed</option>
              <option value="not_analyzed">Not analyzed</option>
              <option value="route_license">Route: License-Acquire</option>
              <option value="route_revival">Route: Revival</option>
              <option value="route_pdi">Route: Public-domain intel</option>
              <option value="route_tech">Route: Tech info</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleReset}
              className="text-sm font-medium text-muted underline underline-offset-2 hover:text-ink">Reset</button>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white transition hover:bg-action-dark disabled:opacity-50">
              {loading ? "Loading…" : "Search"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}

      {/* Batch selection bar — appears once at least one row is checked */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-soft">
          <span className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">{selected.size}</span> selected
            <span className="ml-2 text-xs text-muted">(max {MAX_BATCH} per batch)</span>
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-sm font-medium text-muted underline underline-offset-2 hover:text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setBatchOpen(true)}
              className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white transition hover:bg-action-dark"
            >
              Analyze selected
            </button>
          </div>
        </div>
      )}

      {/* Table card */}
      {(result !== null || loading) && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
          {loading && (
            <div className="space-y-px">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-4 border-b border-line/60 px-4 py-3.5">
                  <div className="h-3.5 w-24 animate-pulse rounded bg-line" />
                  <div className="h-3.5 flex-1 animate-pulse rounded bg-line" />
                  <div className="h-3.5 w-32 animate-pulse rounded bg-line" />
                  <div className="h-3.5 w-16 animate-pulse rounded bg-line" />
                </div>
              ))}
            </div>
          )}

          {!loading && rows.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={rows.length > 0 && rows.every((r) => selected.has(r.number))}
                          onChange={toggleAllOnPage}
                          aria-label="Select all rows on this page"
                          className="h-4 w-4 accent-action"
                        />
                      </th>
                      <th className="px-4 py-3 font-semibold">Patent</th>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Assignee</th>
                      <th className="px-4 py-3 font-semibold">Grant year</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {rows.map((row) => (
                      <tr key={row.number} className="cursor-pointer transition hover:bg-brand-soft/40"
                        onClick={() => handleRowClick(row.number)}>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(row.number)}
                            onChange={(e) => toggleRow(row.number, e.target.checked)}
                            disabled={!selected.has(row.number) && selected.size >= MAX_BATCH}
                            aria-label={`Select ${row.number}`}
                            className="h-4 w-4 accent-action disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-ink-soft">{row.number}</td>
                        <td className="max-w-sm px-4 py-3.5 text-ink"><div className="truncate">{resolvedTitle(row)}</div></td>
                        <td className="max-w-[200px] truncate px-4 py-3.5 text-ink-soft">{resolvedAssignee(row)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted">
                          {row.grant_year ? `~${row.grant_year}` : <span className="text-muted">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right"><ActionCell num={row.number} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-line px-4 py-3">
                <span className="text-xs text-muted">{showingLabel(result!.total, page, rows.length)}</span>
                <div className="flex gap-2">
                  <button onClick={prev} disabled={page === 0 || loading}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40">← Prev</button>
                  <button onClick={next} disabled={rows.length < PAGE_SIZE || loading}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40">Next →</button>
                </div>
              </div>
            </>
          )}

          {!loading && result && rows.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-ink-soft">No patents match your filters.</p>
              <p className="mt-1 text-xs text-muted">Try broadening the keyword, assignee or year range.</p>
            </div>
          )}
        </div>
      )}

      {batchOpen && selected.size > 0 && (
        <BatchAnalyzePanel numbers={Array.from(selected)} onClose={() => setBatchOpen(false)} />
      )}
    </div>
  );
}
