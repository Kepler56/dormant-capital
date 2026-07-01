// scripts/uspto/io.ts
// Why: isolates all side-effecting I/O (HTTP download, zip extraction, line streaming) behind
// two functions so the rest of the loader is pure and testable. sourceLines accepts plain
// .txt/.tsv too, which lets the integration test run on tiny fixtures without real zips.
import { createReadStream, createWriteStream, existsSync, statSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";

export async function ensureDownloaded(url: string, destPath: string): Promise<void> {
  if (existsSync(destPath) && statSync(destPath).size > 1_000_000) return; // already have it
  mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status} for ${url}`);
  try {
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath));
  } catch (e) {
    if (existsSync(destPath)) rmSync(destPath);
    throw e;
  }
  if (statSync(destPath).size < 1_000_000) { rmSync(destPath); throw new Error(`Suspiciously small download: ${url}`); }
}

export async function* sourceLines(filePath: string, entryMatch: (name: string) => boolean): AsyncIterable<string> {
  let input: NodeJS.ReadableStream;
  if (/\.zip$/i.test(filePath)) {
    const directory = await unzipper.Open.file(filePath);
    const entry = directory.files.find((f) => entryMatch(f.path));
    if (!entry) throw new Error(`No entry matching in ${filePath}`);
    input = entry.stream();
  } else {
    input = createReadStream(filePath);
  }
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}
