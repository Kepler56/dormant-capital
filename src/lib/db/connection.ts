// db/connection.ts
// Why: one shared libSQL client for the whole server process, plus tiny async helpers so the
// rest of the app never touches the raw driver. libSQL is SQLite-compatible but network-async,
// which is what lets the SAME code run on Turso (serverless / Vercel) in production and on a
// local file (or :memory: under tests) in dev — no persistent local filesystem required.
//
// Connection target, in priority order:
//   • tests (VITEST)                          → ":memory:" (each worker gets its own DB)
//   • TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN)  → the hosted Turso database (production)
//   • DORMANT_DB_URL                           → explicit override
//   • default                                  → "file:data/dormant.db" (local dev)
//
// Schema is ensured once per process via a cached promise (idempotent CREATE ... IF NOT EXISTS).
import { createClient, type Client, type InArgs, type InStatement } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { ensureSchema } from "./schema";

function config(): { url: string; authToken?: string } {
  if (process.env.VITEST) return { url: ":memory:" };
  const turso = process.env.TURSO_DATABASE_URL;
  if (turso) return { url: turso, authToken: process.env.TURSO_AUTH_TOKEN };
  const url = process.env.DORMANT_DB_URL ?? "file:data/dormant.db";
  // A local file: URL needs its parent directory to exist (Turso/:memory: do not).
  if (url.startsWith("file:")) {
    const p = url.slice("file:".length);
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    if (dir) mkdirSync(dir, { recursive: true });
  }
  return { url };
}

// Module-level singleton so Next hot-reload / repeated imports reuse one client + one schema
// bootstrap. Stored on globalThis for the same reason across the dev server's module graph.
const g = globalThis as unknown as { __libsql?: Client; __ready?: Promise<void> };
export const db: Client = g.__libsql ?? (g.__libsql = createClient(config()));

/** Ensure the schema exists exactly once per process. Every helper awaits this first. */
export function ready(): Promise<void> {
  return (g.__ready ??= ensureSchema(db));
}

/** SELECT → all rows as plain objects (libSQL Rows spread cleanly to named columns). */
export async function all<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  await ready();
  const rs = await db.execute({ sql, args });
  return rs.rows.map((r) => ({ ...r })) as unknown as T[];
}

/** SELECT → the first row, or undefined. */
export async function get<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

/** INSERT/UPDATE/DELETE. lastInsertRowid is a bigint in libSQL — callers Number() it. */
export async function run(
  sql: string,
  args: InArgs = []
): Promise<{ rowsAffected: number; lastInsertRowid?: bigint }> {
  await ready();
  const rs = await db.execute({ sql, args });
  return { rowsAffected: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid ?? undefined };
}

/** Atomic multi-statement write (replaces better-sqlite3 transactions). */
export async function batch(stmts: InStatement[]): Promise<void> {
  await ready();
  await db.batch(stmts, "write");
}
