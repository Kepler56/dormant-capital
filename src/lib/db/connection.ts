// db/connection.ts
// Why: one shared SQLite handle for the whole server process. better-sqlite3 is
// synchronous, which keeps our data layer tiny and easy to reason about — no async
// noise around what are really local, sub-millisecond reads/writes.
//
// Test isolation: when running under Vitest (process.env.VITEST is set), each
// worker process opens its own private ":memory:" database instead of the shared
// on-disk file. This eliminates cross-worker races on the file and makes the suite
// deterministic. WAL is irrelevant for in-memory DBs and is skipped in that path.
// Dev/prod behavior is unchanged — the file DB at data/dormant.db is used whenever
// VITEST is not set. An optional DORMANT_DB_PATH env var overrides the file path
// for non-test environments.
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ensureSchema } from "./schema";

const isTest = !!process.env.VITEST;

// Module-level singleton: re-importing must not reopen the file (Next hot-reload).
const g = globalThis as unknown as { __db?: Database.Database };
function open(): Database.Database {
  if (isTest) {
    // Each Vitest worker gets its own private in-memory DB — no file I/O, no races.
    const db = new Database(":memory:");
    ensureSchema(db);
    return db;
  }

  const DATA_DIR = path.join(process.cwd(), "data");
  mkdirSync(path.join(DATA_DIR, "raw"), { recursive: true });
  const dbPath = process.env.DORMANT_DB_PATH ?? path.join(DATA_DIR, "dormant.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL"); // concurrent reads while we write; safe for local use
  ensureSchema(db);
  return db;
}
export const db: Database.Database = g.__db ?? (g.__db = open());
