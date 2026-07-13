// app/api/outcomes/route.ts
// Why: HTTP seam for the micro-outcome ledger. POST validates in insertOutcome and
// surfaces its thrown message verbatim as a 400 (e.g. the terminal-without-reason
// message) so the UI can show the exact reason a log attempt was rejected. Before that,
// the request itself is validated: a malformed body is a 400 (not an uncaught 500), and
// assetId is coerced/range-checked and confirmed to reference a real asset (libSQL does
// not enforce the FK) so a bad id 404s instead of landing a dangling row in the moat table.
import { NextResponse } from "next/server";
import { insertOutcome, listOutcomes } from "@/lib/outcomes/queries";
import { assetExists } from "@/lib/db/queries";
import type { OutcomeEvent, ReasonCode } from "@/lib/outcomes/types";

// Shared assetId coercion: accepts whatever the caller sent (string, number, garbage) and
// only lets a finite positive integer through — everything else is a validation failure.
function parseAssetId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = (typeof body === "object" && body !== null ? body : {}) as {
    assetId?: unknown;
    eventType: OutcomeEvent;
    reasonCode?: ReasonCode | null;
    note?: string | null;
    mandateId?: number | null;
  };
  const assetId = parseAssetId(raw.assetId);
  if (assetId === null) {
    return NextResponse.json({ ok: false, error: "assetId must be a positive integer." }, { status: 400 });
  }
  if (!(await assetExists(assetId))) {
    return NextResponse.json({ ok: false, error: "Unknown asset." }, { status: 404 });
  }
  try {
    await insertOutcome({
      assetId,
      eventType: raw.eventType,
      reasonCode: raw.reasonCode ?? null,
      note: raw.note ?? null,
      mandateId: raw.mandateId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const assetId = parseAssetId(new URL(req.url).searchParams.get("assetId"));
  if (assetId === null) {
    return NextResponse.json({ ok: false, error: "assetId must be a positive integer." }, { status: 400 });
  }
  const outcomes = await listOutcomes(assetId);
  return NextResponse.json({ outcomes });
}
