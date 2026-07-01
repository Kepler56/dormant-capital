// scripts/uspto/run.ts
// Why: the loader pipeline as one awaitable function so the integration test can drive it
// against fixture paths. Two streaming passes over the fee file (select, then collect),
// then a filtered stream of each biblio TSV, then materialize per patent.
import { loaderConfig, SOURCES } from "./config";
import { ensureDownloaded, sourceLines } from "./io";
import { parseFeeLine, isPaymentCode, EXP_CODE, EXPX_CODE, type FeeEvent } from "./fee";
import { selectSubset } from "./select";
import { headerIndex, parseGPatent, parseAssignee, parseCpc } from "./biblio";
import { materializePatent, type PatentBundle } from "./materialize";
import path from "node:path";

type Src = { url: string; zipName: string; entryMatch: (n: string) => boolean };

async function resolveSource(src: Src, localPath: string | undefined, rawDir: string): Promise<string> {
  if (localPath) return localPath;                      // fixture / pre-downloaded
  const dest = path.join(rawDir, src.zipName);
  await ensureDownloaded(src.url, dest);
  return dest;
}

export async function runLoad(): Promise<{ subsetSize: number; loaded: number }> {
  const cfg = loaderConfig();
  const retrievedAt = new Date().toISOString();
  const feePath = await resolveSource(SOURCES.fee, cfg.localPaths.fee, cfg.rawDir);

  // ---- Fee Pass 1: classify the population ----
  const dormant = new Set<string>(), paid = new Set<string>(), hasExpx = new Set<string>();
  for await (const line of sourceLines(feePath, SOURCES.fee.entryMatch)) {
    const e = parseFeeLine(line);
    if (!e) continue;
    if (e.eventCode === EXP_CODE) dormant.add(e.number);
    else if (e.eventCode === EXPX_CODE) hasExpx.add(e.number);
    else if (isPaymentCode(e.eventCode)) paid.add(e.number);
  }
  for (const n of hasExpx) { dormant.delete(n); paid.add(n); } // reinstated ⇒ not dormant, treat as active
  for (const n of dormant) paid.delete(n);              // dormant wins over paid
  const subset = selectSubset([...dormant], [...paid],
    { dormantCap: cfg.dormantCap, paidCap: cfg.paidCap, forceInclude: [cfg.vrfb] });

  // ---- Fee Pass 2: collect events for the subset ----
  const events = new Map<string, FeeEvent[]>();
  for await (const line of sourceLines(feePath, SOURCES.fee.entryMatch)) {
    const e = parseFeeLine(line);
    if (!e || !subset.has(e.number)) continue;
    (events.get(e.number) ?? events.set(e.number, []).get(e.number)!).push(e);
  }

  // ---- Biblio joins (filtered streams) ----
  const titles = new Map<string, { title: string | null; grantDate: string | null }>();
  const gp = await resolveSource(SOURCES.gPatent, cfg.localPaths.gPatent, cfg.rawDir);
  await streamTsv(gp, SOURCES.gPatent.entryMatch, (cols, idx) => {
    const r = parseGPatent(cols, idx); if (r && subset.has(r.number)) titles.set(r.number, { title: r.title, grantDate: r.grantDate });
  });

  const assignees = new Map<string, string | null>();
  const ap = await resolveSource(SOURCES.assignee, cfg.localPaths.assignee, cfg.rawDir);
  await streamTsv(ap, SOURCES.assignee.entryMatch, (cols, idx) => {
    const r = parseAssignee(cols, idx);
    if (r && subset.has(r.number) && r.sequence === 0) assignees.set(r.number, r.org);
  });

  const cpc = new Map<string, string[]>();
  if (cfg.includeCpc) {
    const cp = await resolveSource(SOURCES.cpc, cfg.localPaths.cpc, cfg.rawDir);
    await streamTsv(cp, SOURCES.cpc.entryMatch, (cols, idx) => {
      const r = parseCpc(cols, idx);
      if (r && subset.has(r.number)) { const arr = cpc.get(r.number) ?? cpc.set(r.number, []).get(r.number)!; arr.push(r.symbol); }
    });
  }

  // ---- Materialize ----
  const urls = { fee: SOURCES.fee.url, gPatent: SOURCES.gPatent.url, assignee: SOURCES.assignee.url, cpc: SOURCES.cpc.url };
  let loaded = 0;
  for (const number of subset) {
    const evs = events.get(number);
    if (!evs || !evs.length) continue;                  // no fee history ⇒ skip
    const meta = titles.get(number);
    const bundle: PatentBundle = {
      number, events: evs,
      title: meta?.title ?? null,
      assignee: assignees.get(number) ?? null,
      grantDate: meta?.grantDate ?? evs[0].grantDate,
      filingDate: evs[0].filingDate,
      entityStatus: evs[evs.length - 1].entityStatus,
      cpc: cpc.get(number) ?? [],
    };
    materializePatent(bundle, urls, retrievedAt);
    loaded++;
  }
  return { subsetSize: subset.size, loaded };
}

async function streamTsv(filePath: string, match: (n: string) => boolean, onRow: (cols: string[], idx: Record<string, number>) => void) {
  let idx: Record<string, number> | null = null;
  for await (const line of sourceLines(filePath, match)) {
    if (idx === null) { idx = headerIndex(line); continue; }
    onRow(line.split("\t"), idx);
  }
}
