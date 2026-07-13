// components/PatentSearch.tsx
// Why: client component for the local patent catalogue browser. It calls the offline
// /api/index endpoint (never touches the network), then lazily enriches un-titled rows via
// /api/enrich in the background. A row click ingests the patent (/api/ingest → local facts)
// and navigates to its verdict. Filters (keyword, assignee, grant-year range, dormant-only)
// make the ~35k loaded catalogue easy to search. This file must NOT import anything from
// @/lib/db or other server modules — all server work goes through fetch.
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

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
  sort: "number" | "year_desc" | "year_asc";
};
const INITIAL: Filters = {
  q: "", assignee: "", yearAfter: "", yearBefore: "",
  cpc: "", entityStatus: "", status: "", sort: "number",
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
  if (f.sort !== "number") p.set("sort", f.sort);
  p.set("page", String(page));
  return p.toString();
}

const INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft";

// ─── Main component ───────────────────────────────────────────────────────────
export default function PatentSearch() {
  const router = useRouter();

  // `filters` is what the current results reflect; `pending` is the in-progress form.
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [pending, setPending] = useState<Filters>(INITIAL);
  const [page, setPage] = useState(0);
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

  useEffect(() => { run(INITIAL, 0); }, [run]);

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

  // ── Event handlers ───────────────────────────────────────────────────────────
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilters(pending);
    setPage(0);
    run(pending, 0);
  }
  function handleReset() {
    setPending(INITIAL);
    setFilters(INITIAL);
    setPage(0);
    run(INITIAL, 0);
  }
  function prev() { const p = Math.max(0, page - 1); setPage(p); run(filters, p); }
  function next() { const p = page + 1; setPage(p); run(filters, p); }

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
    </div>
  );
}
