// lib/index/seed.ts
// Why: makes the Patents table populated out-of-the-box with ZERO network dependency.
// On first run we load the bundled list of ~4,000 real US patent numbers into
// patent_index (with a derived grant year). This is the offline backbone; titles are
// enriched later, lazily, per row. In production the Turso DB is pre-loaded with the full
// ~35k subset, so this is a cheap no-op (the catalogue is already non-empty).
import { get, batch } from "@/lib/db/connection";
import { grantYearForNumber } from "./year";
import seedNumbers from "@/data/seed-patents.json";

const CHUNK = 500; // keep each libSQL batch request modest

// Idempotent: only seeds when the catalogue is empty, so it runs once and is cheap to call
// on every boot.
export async function seedIndexIfEmpty(): Promise<void> {
  const row = await get<{ n: number }>("SELECT COUNT(*) n FROM patent_index");
  if (Number(row?.n ?? 0) > 0) return;

  const nums = seedNumbers as string[];
  for (let i = 0; i < nums.length; i += CHUNK) {
    await batch(
      nums.slice(i, i + CHUNK).map((num) => ({
        sql: "INSERT OR IGNORE INTO patent_index (number, grant_year) VALUES (?, ?)",
        args: [num, grantYearForNumber(num)],
      }))
    );
  }
}
