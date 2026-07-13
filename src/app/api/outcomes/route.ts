// app/api/outcomes/route.ts
// Why: HTTP seam for the micro-outcome ledger. POST validates in insertOutcome and
// surfaces its thrown message verbatim as a 400 (e.g. the terminal-without-reason
// message) so the UI can show the exact reason a log attempt was rejected.
import { NextResponse } from "next/server";
import { insertOutcome, listOutcomes } from "@/lib/outcomes/queries";
import type { OutcomeEvent, ReasonCode } from "@/lib/outcomes/types";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    assetId: number;
    eventType: OutcomeEvent;
    reasonCode?: ReasonCode | null;
    note?: string | null;
    mandateId?: number | null;
  };
  try {
    await insertOutcome({
      assetId: body.assetId,
      eventType: body.eventType,
      reasonCode: body.reasonCode ?? null,
      note: body.note ?? null,
      mandateId: body.mandateId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const assetId = Number(new URL(req.url).searchParams.get("assetId"));
  const outcomes = await listOutcomes(assetId);
  return NextResponse.json({ outcomes });
}
