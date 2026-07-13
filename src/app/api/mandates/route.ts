// app/api/mandates/route.ts
// Why: HTTP seam for buyer mandates (brief Upgrade 3). insertMandate throws on empty
// name/thesis; that message is surfaced verbatim as a 400 the same way /api/outcomes does.
import { NextResponse } from "next/server";
import { insertMandate, listMandates, deleteMandate } from "@/lib/mandates/queries";

export async function GET() {
  const mandates = await listMandates();
  return NextResponse.json({ mandates });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; thesis?: string };
  try {
    const id = await insertMandate(String(body.name ?? ""), String(body.thesis ?? ""));
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  await deleteMandate(id);
  return NextResponse.json({ ok: true });
}
