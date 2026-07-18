// web/src/app/page.tsx (Dashboard)
// Why: the at-a-glance command center. It reads as a serious analytics product: a deep-blue
// hero backplate with the headline number, supporting stat cards, a "verdict mix" panel
// with score rings, the sourcing pipeline as a funnel, and the recent-activity table —
// all in the USER'S language (Strong / Watch / Not a fit), no internal jargon. Every figure
// comes straight from the DB as a Server Component, so the page always reflects real state.
import Link from "next/link";
import { all, get } from "@/lib/db/connection";
import { indexTotal } from "@/lib/index/queries";
import { seedIndexIfEmpty } from "@/lib/index/seed";
import ScoreBadge from "@/components/ScoreBadge";
import Gauge from "@/components/ui/Gauge";

export const dynamic = "force-dynamic";

type BandRow = { band: string; count: number };
type GateRow = { passedGate: number; failedGate: number };
type RecentRow = {
  asset_id: number; external_id: string; band: string;
  dormancy: number | null; composite: number | null; scored_at: string;
};

const LATEST = `
  SELECT asset_id, payload, created_at, id,
         ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY id DESC) AS rn
  FROM event_log WHERE event_type = 'score_computed'
`;

export default async function Dashboard() {
  await seedIndexIfEmpty();
  const catalogue = await indexTotal();
  const assets = Number((await get<{ n: number }>("SELECT COUNT(*) n FROM asset"))?.n ?? 0);
  const analyzed = Number(
    (await get<{ n: number }>("SELECT COUNT(DISTINCT asset_id) n FROM event_log WHERE event_type='score_computed'"))?.n ?? 0
  );

  const bandRows = await all<BandRow>(
    `SELECT json_extract(payload,'$.band') AS band, COUNT(*) AS count
     FROM (${LATEST}) WHERE rn = 1 GROUP BY band`
  );
  const band: Record<string, number> = { ROUTE: 0, WATCH: 0, PASS: 0 };
  for (const r of bandRows) if (r.band in band) band[r.band] = Number(r.count);
  const totalScored = band.ROUTE + band.WATCH + band.PASS;

  const gate = await get<GateRow>(
    `SELECT
       SUM(CASE WHEN json_extract(payload,'$.passedGate')=1 THEN 1 ELSE 0 END) AS passedGate,
       SUM(CASE WHEN json_extract(payload,'$.passedGate')=0 THEN 1 ELSE 0 END) AS failedGate
       FROM (${LATEST}) WHERE rn = 1`
  );
  const passedGate = Number(gate?.passedGate ?? 0);
  const failedGate = Number(gate?.failedGate ?? 0);

  const recent = await all<RecentRow>(
    `SELECT l.asset_id, a.external_id,
                json_extract(l.payload,'$.band')      AS band,
                json_extract(l.payload,'$.dormancy')  AS dormancy,
                json_extract(l.payload,'$.composite') AS composite,
                l.created_at                          AS scored_at
              FROM (${LATEST}) l JOIN asset a ON a.id = l.asset_id
              WHERE l.rn = 1 ORDER BY l.created_at DESC LIMIT 8`
  );

  const pct = (n: number) => (totalScored ? Math.round((n / totalScored) * 100) : 0);
  const strongShare = pct(band.ROUTE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Find, score and route dormant patents — every verdict auditable to its source.
          </p>
        </div>
        <Link href="/patents" className="inline-flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-action-dark">
          Browse patents
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </Link>
      </div>

      {/* Hero + supporting stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-forest to-forest-dark p-6 text-white shadow-ring">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-100/80">Patents analyzed</div>
          <div className="mt-3 font-display text-5xl font-bold tabular-nums leading-none">{analyzed}</div>
          <div className="mt-3 text-sm text-blue-100/90">{catalogue.toLocaleString()} in the catalogue</div>
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-12 -right-4 h-24 w-24 rounded-full bg-brand/30 blur-xl" />
        </div>
        <Stat label="Dormant candidates" value={passedGate} hint="cleared the dormancy screen" tone="brand" />
        <Stat label="Strong opportunities" value={band.ROUTE} hint="ready to route to a buyer" tone="action" />
        <Stat label="Worth watching" value={band.WATCH} hint="on the radar, softer case" tone="ink" />
      </div>

      {/* Verdict mix + pipeline */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <CardTitle>Verdict mix</CardTitle>
            <span className="text-xs text-muted">across each patent&apos;s latest analysis</span>
          </div>
          {totalScored === 0 ? (
            <p className="mt-6 text-sm text-ink-soft">No patents analyzed yet — your verdict mix will appear here.</p>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
              <div className="flex flex-col items-center">
                <Gauge value={strongShare} size={130} stroke={13} color="#1D4ED8" suffix="%" />
                <span className="mt-2 text-xs font-medium text-muted">are strong opportunities</span>
              </div>
              <div className="flex-1 space-y-3 self-stretch">
                <BandBar label="Strong opportunity" count={band.ROUTE} pct={pct(band.ROUTE)} color="bg-brand" />
                <BandBar label="Worth watching" count={band.WATCH} pct={pct(band.WATCH)} color="bg-watch" />
                <BandBar label="Not a fit" count={band.PASS} pct={pct(band.PASS)} color="bg-idle" />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Sourcing pipeline</CardTitle>
          <p className="mb-4 mt-1 text-xs text-muted">From catalogue to routed opportunity.</p>
          <FunnelRow label="Catalogue" value={catalogue.toLocaleString()} />
          <FunnelRow label="Ingested" value={assets} />
          <FunnelRow label="Analyzed" value={analyzed} />
          <FunnelRow label="Dormant" value={passedGate} accent />
          <FunnelRow label="Routed" value={band.ROUTE} accent last />
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            {failedGate} screened out as still active.
          </p>
        </Card>
      </div>

      {/* Recently analyzed */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between px-6 pt-5">
          <CardTitle className="mb-0">Recently analyzed</CardTitle>
          <Link href="/patents" className="text-xs font-semibold text-action hover:underline">Browse more →</Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-6 pb-6 pt-3 text-sm text-ink-soft">
            No patents analyzed yet. <Link href="/patents" className="font-medium text-action hover:underline">Browse the catalogue</Link>, open one, and press Analyze.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-2.5 font-semibold">Patent</th>
                <th className="py-2.5 font-semibold">Verdict</th>
                <th className="py-2.5 text-right font-semibold">Dormancy</th>
                {/* This column renders `composite`, the blended score — NOT the `opportunity`
                    sub-score, which is a separate field on the same payload. It was headed
                    "Opportunity", so the table silently reported one number under another's name. */}
                <th className="py-2.5 text-right font-semibold">Overall</th>
                <th className="px-6 py-2.5 text-right font-semibold">Scored</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.asset_id} className="border-b border-line/60 last:border-0 transition hover:bg-canvas">
                  <td className="px-6 py-3.5"><Link href={`/patents/${r.asset_id}`} className="font-mono text-xs font-semibold text-action hover:underline">{r.external_id}</Link></td>
                  <td className="py-3.5"><ScoreBadge band={r.band} /></td>
                  <td className="py-3.5 text-right tabular-nums text-ink-soft">{r.dormancy ?? "—"}</td>
                  <td className="py-3.5 text-right tabular-nums text-ink-soft">{r.composite ?? "—"}</td>
                  <td className="px-6 py-3.5 text-right text-xs text-muted">{r.scored_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Local presentational helpers ─────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-6 shadow-soft ${className}`}>{children}</div>;
}
function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-sm font-bold text-ink ${className}`}>{children}</h2>;
}

const TONE_VALUE: Record<string, string> = { brand: "text-brand-dark", action: "text-action", ink: "text-ink" };
function Stat({ label, value, hint, tone = "ink" }: { label: string; value: React.ReactNode; hint: string; tone?: "brand" | "action" | "ink" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-3 font-display text-4xl font-bold tabular-nums leading-none ${TONE_VALUE[tone]}`}>{value}</div>
      <div className="mt-3 text-sm text-muted">{hint}</div>
    </div>
  );
}
function BandBar({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-muted">{count} · {pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-canvas">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}
function FunnelRow({ label, value, accent, last }: { label: string; value: React.ReactNode; accent?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${last ? "" : "border-b border-line/60"}`}>
      <span className={`text-sm ${accent ? "font-semibold text-brand-dark" : "text-ink-soft"}`}>{label}</span>
      <span className={`tabular-nums text-sm font-semibold ${accent ? "text-brand-dark" : "text-ink"}`}>{value}</span>
    </div>
  );
}
