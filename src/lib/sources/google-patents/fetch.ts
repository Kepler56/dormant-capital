// sources/google-patents/fetch.ts
// Why: Google Patents is our no-API-key front door. We fetch the public English
// patent page with a browser UA (the server 403s default fetch agents) and persist
// the raw HTML under data/raw/ so every downstream fact is replayable from the exact
// bytes we saw — provenance starts at retrieval, not at parse.
import { writeFileSync } from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export function patentUrl(num: string): string {
  // Normalize "US 4,786,567" / "4786567" -> canonical "US4786567A" page slug.
  const clean = num.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const withCountry = /^US/.test(clean) ? clean : `US${clean}`;
  const withKind = /[A-Z]\d?$/.test(withCountry) ? withCountry : `${withCountry}A`;
  return `https://patents.google.com/patent/${withKind}/en`;
}

// Google Patents intermittently answers 503/429 when hit repeatedly. Those are transient,
// so we retry a few times with linear backoff before giving up; other statuses (e.g. a
// real 404) fail immediately since retrying won't help.
const TRANSIENT = new Set([429, 503, 502, 500]);

export async function fetchPatentHtml(num: string): Promise<{ html: string; url: string }> {
  const url = patentUrl(num);
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1500));
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
    if (res.ok) {
      const html = await res.text();
      const raw = path.join(process.cwd(), "data", "raw", `${num.replace(/\W/g, "")}.html`);
      writeFileSync(raw, html, "utf8"); // replayable provenance
      return { html, url };
    }
    lastStatus = res.status;
    if (!TRANSIENT.has(res.status)) break; // permanent error — stop retrying
  }
  throw new Error(`Google Patents returned ${lastStatus} for ${url} (after retries)`);
}
