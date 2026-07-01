// scripts/push-to-turso.ts
// Why: copy the fully-built local catalogue (file:data/dormant.db, ~35k patents with facts)
// into a hosted Turso database over the network — no Turso CLI / WSL required. It reuses the
// same @libsql/client, ensures the schema on the target, then bulk-copies every table in
// batched writes (fast: hundreds of round-trips, not hundreds of thousands). Idempotent via
// INSERT OR IGNORE, so re-running only fills gaps.
//
// Usage (PowerShell):
//   $env:TURSO_DATABASE_URL="libsql://<db>-<org>.turso.io"
//   $env:TURSO_AUTH_TOKEN="<token>"
//   npm run push:turso
// Optional: SRC_DB_URL to copy from a different local file (default file:data/dormant.db);
//           DST_* are the two TURSO_* vars above.
import { createClient, type InStatement } from "@libsql/client";
import { ensureSchema } from "../src/lib/db/schema";

const CHUNK = 500;
// Parent-before-child so a fresh target with FKs enabled would still be satisfied.
const TABLES = ["patent_index", "asset", "fact", "judgment", "event_log", "maintenance_event"];

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first (see README → Deploy).");
    process.exit(1);
  }
  const src = createClient({ url: process.env.SRC_DB_URL ?? "file:data/dormant.db" });
  const dst = createClient({ url, authToken });

  await ensureSchema(dst);

  for (const table of TABLES) {
    const rs = await src.execute(`SELECT * FROM ${table}`);
    const cols = rs.columns;
    if (rs.rows.length === 0) { console.log(`· ${table}: 0 rows`); continue; }
    const placeholders = `(${cols.map(() => "?").join(", ")})`;
    const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES ${placeholders}`;

    let written = 0;
    for (let i = 0; i < rs.rows.length; i += CHUNK) {
      const stmts: InStatement[] = rs.rows.slice(i, i + CHUNK).map((row) => ({
        sql,
        args: cols.map((c) => (row as Record<string, unknown>)[c] as never),
      }));
      await dst.batch(stmts, "write");
      written += stmts.length;
      process.stdout.write(`\r  ${table}: ${written}/${rs.rows.length}`);
    }
    process.stdout.write("\n");
  }
  console.log("Done — Turso is populated. Set the same two env vars in Vercel and deploy.");
}

main().catch((e) => { console.error("\npush-to-turso failed:", e); process.exit(1); });
