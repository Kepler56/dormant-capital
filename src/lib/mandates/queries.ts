// lib/mandates/queries.ts
// Why: a buyer mandate (name + standing thesis) is the demand-side counterpart to the
// asset catalogue — the per-(mandate, asset) Buyer-Fit Score is scored against whatever is
// stored here. Thin typed gateway, same shape as db/queries.ts: no raw SQL leaks past this
// module. Name/thesis are required content (not just present) so a mandate always carries
// enough text for the buyer-fit prompt to work with.
import { all, get, run } from "@/lib/db/connection";

export type MandateRow = { id: number; name: string; thesis: string; created_at: string };

export async function insertMandate(name: string, thesis: string): Promise<number> {
  const n = name.trim();
  const t = thesis.trim();
  if (!n) throw new Error("Mandate name is required.");
  if (!t) throw new Error("Mandate thesis is required.");
  const res = await run(`INSERT INTO mandate (name, thesis) VALUES (?, ?)`, [n, t]);
  return Number(res.lastInsertRowid);
}

export async function listMandates(): Promise<MandateRow[]> {
  return all<MandateRow>(`SELECT * FROM mandate ORDER BY id DESC`);
}

export async function deleteMandate(id: number): Promise<void> {
  await run(`DELETE FROM mandate WHERE id=?`, [id]);
}

export async function getMandate(id: number): Promise<MandateRow | null> {
  const row = await get<MandateRow>(`SELECT * FROM mandate WHERE id=?`, [id]);
  return row ?? null;
}
