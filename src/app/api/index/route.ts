// app/api/index/route.ts
// Why: serves the local patent catalogue (the bundled, offline-safe backbone of the
// Patents table) with filtering + pagination. It also lazily seeds the catalogue on the
// first call, so a fresh install populates itself with no extra setup step.
import { NextResponse } from "next/server";
import { seedIndexIfEmpty } from "@/lib/index/seed";
import { searchLocalIndex } from "@/lib/index/queries";

export function GET(req: Request) {
  seedIndexIfEmpty();
  const u = new URL(req.url);
  const int = (k: string) => (u.searchParams.get(k) ? parseInt(u.searchParams.get(k)!, 10) : undefined);
  const { total, rows } = searchLocalIndex({
    q: u.searchParams.get("q") || undefined,
    assignee: u.searchParams.get("assignee") || undefined,
    yearAfter: int("yearAfter"),
    yearBefore: int("yearBefore"),
    dormantOnly: u.searchParams.get("dormantOnly") === "1",
    page: int("page") ?? 0,
    pageSize: 25,
  });
  return NextResponse.json({ total, rows });
}
