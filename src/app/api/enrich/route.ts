// app/api/enrich/route.ts
// Why: lazily turns bundled patent NUMBERS into readable rows. The Patents table posts the
// numbers currently visible on screen; we scrape each patent's Google Patents page for its
// title/assignee and cache the result in patent_index. Best-effort and free (no LLM): any
// patent that fails (e.g. transient 503) simply stays a number and can be retried later.
import { NextResponse } from "next/server";
import { enrichBatch } from "@/lib/sources/google-patents/enrich";

export async function POST(req: Request) {
  const { numbers } = (await req.json()) as { numbers: string[] };
  // Bound the batch so a single request can't fan out into hundreds of scrapes.
  const results = await enrichBatch((numbers ?? []).slice(0, 25));
  return NextResponse.json({ results });
}
