// app/api/ingest/route.ts
// Why: HTTP seam for ingestion. Accepts one or many patent numbers, ingests each,
// and returns per-number success/failure so the UI can show partial results (one bad
// number must not fail the batch). No auth/limit here — ingestion costs no tokens.
import { NextResponse } from "next/server";
import { ingestPatent } from "@/lib/pipeline/ingest";

export async function POST(req: Request) {
  const { numbers } = (await req.json()) as { numbers: string[] };
  const results = [];
  for (const num of numbers) {
    try {
      const { assetId } = await ingestPatent(num);
      results.push({ num, ok: true, assetId });
    } catch (e) {
      results.push({ num, ok: false, error: (e as Error).message });
    }
  }
  return NextResponse.json({ results });
}
