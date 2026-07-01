// lib/index/seed.ts
// Why: makes the Patents table populated out-of-the-box with ZERO network dependency.
// On first run we load the bundled list of ~4,000 real US patent numbers into
// patent_index (with a derived grant year). This is the offline backbone that survives
// Google Patents rate-limiting — titles are enriched later, lazily, per row.
import { db } from "@/lib/db/connection";
import { grantYearForNumber } from "./year";
import seedNumbers from "@/data/seed-patents.json";

// Idempotent: only seeds when the catalogue is empty, so it runs once and is cheap to
// call on every boot. Wrapped in a transaction — 4k inserts as one fast write.
export function seedIndexIfEmpty(): void {
  const count = (db.prepare("SELECT COUNT(*) n FROM patent_index").get() as { n: number }).n;
  if (count > 0) return;

  const insert = db.prepare(
    "INSERT OR IGNORE INTO patent_index (number, grant_year) VALUES (?, ?)"
  );
  const tx = db.transaction((nums: string[]) => {
    for (const num of nums) insert.run(num, grantYearForNumber(num));
  });
  tx(seedNumbers as string[]);
}
