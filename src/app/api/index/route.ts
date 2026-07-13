// app/api/index/route.ts
// Why: serves the local patent catalogue (the bundled, offline-safe backbone of the
// Patents table) with filtering + pagination. It also lazily seeds the catalogue on the
// first call, so a fresh install populates itself with no extra setup step.
import { NextResponse } from "next/server";
import { seedIndexIfEmpty } from "@/lib/index/seed";
import { searchLocalIndex } from "@/lib/index/queries";
import { SECTOR_KEYS } from "@/lib/index/sectors";

const ENTITY_STATUSES = ["large", "small", "micro"] as const;
const STATUSES = ["lapsed", "maintained"] as const;
const SORTS = ["number", "year_desc", "year_asc"] as const;
const LAPSE_AGES = ["recent2", "recent5", "stale5"] as const;
const ANALYSES = ["analyzed", "not_analyzed", "route_license", "route_revival", "route_pdi", "route_tech"] as const;

function oneOf<T extends string>(v: string | null, allowed: readonly T[]): T | undefined {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export async function GET(req: Request) {
  await seedIndexIfEmpty();
  const u = new URL(req.url);
  const int = (k: string) => (u.searchParams.get(k) ? parseInt(u.searchParams.get(k)!, 10) : undefined);
  // API back-compat: dormantOnly=1 (pre-Task-8 clients) is treated as status=lapsed, unless the
  // caller already sent an explicit (valid) status.
  const status = oneOf(u.searchParams.get("status"), STATUSES)
    ?? (u.searchParams.get("dormantOnly") === "1" ? "lapsed" : undefined);
  const { total, rows } = await searchLocalIndex({
    q: u.searchParams.get("q") || undefined,
    assignee: u.searchParams.get("assignee") || undefined,
    yearAfter: int("yearAfter"),
    yearBefore: int("yearBefore"),
    cpc: u.searchParams.get("cpc") || undefined,
    entityStatus: oneOf(u.searchParams.get("entityStatus"), ENTITY_STATUSES),
    status,
    sector: oneOf(u.searchParams.get("sector"), SECTOR_KEYS),
    lapseAge: oneOf(u.searchParams.get("lapseAge"), LAPSE_AGES),
    analysis: oneOf(u.searchParams.get("analysis"), ANALYSES),
    sort: oneOf(u.searchParams.get("sort"), SORTS),
    page: int("page") ?? 0,
    pageSize: 25,
  });
  return NextResponse.json({ total, rows });
}
