# Dormant Capital — Scoring Console

Self-contained Next.js app: browse a local catalogue of ~35,000 real US patents
(offline, no key required), then run the gated, agentic Dormant Score on an explicit
Analyze click. **Bring your own model** — every analysis (reasoning *and* web search)
runs on your own provider/model/key, so **no `.env` is required to deploy.**

## Run
1. `npm install`
2. `npm run dev` → http://localhost:3000
3. Open **Settings → Bring your own model**, pick OpenAI / Anthropic / Gemini,
   paste your API key, and Save. That's it — nothing runs on a shared server key.

No environment variables are needed. Your key is stored only in your browser
(`localStorage`) and is sent with each Analyze request; it is never persisted server-side.

## Flow
1. **Patents page** — the local catalogue loads instantly (offline, never 503s).
   Filter by keyword, assignee, grant-year range, or **dormant only** (maintenance-fee
   lapsed) to find candidates fast. Titles and assignees are already loaded for the
   bundled USPTO subset.
2. **Click a row** — the patent is pulled in from local facts and you land on its
   detail page automatically.
3. **Detail page** — shows sourced facts, the current band/score, and the LLM
   evidence cards. Press **Analyze** to run (or re-run) the agentic scorer live.
4. **Settings — Bring your own model** — pick a provider, paste a key. Required
   before Analyze works; there is no shared server model.

## Bring your own model (any provider)
The agentic scorer is provider-agnostic. Whatever you configure runs *both* the
structured reasoning and the grounded **web search**:
- **Gemini** → Google Search grounding
- **OpenAI** → the Responses API `web_search` tool
- **Anthropic** → the `web_search` server tool

Web search is bounded: at most `MAX_WEB_SEARCHES` (6) searches per analysis, ≤5
results each, each call timeout-guarded. If a chosen model doesn't support web
search, that step degrades gracefully to "ungrounded" rather than failing.

## How it works
- **Catalogue backbone** (`/api/index`): a local SQLite table backs the Patents table,
  populated by the USPTO bulk loader below (~35k patents, titles/assignees/facts already
  filled). A small bundled seed is used if the loader hasn't run. Browsing never touches
  the network; filtering (keyword/assignee/year/dormant-only) is all SQLite.
- **Facts** (immutable, sourced) come from the USPTO bulk data on load; for any patent
  outside the loaded subset, ingest falls back to a Google Patents page scrape.
- The **dormancy gate** is data-first: only a maintenance-fee lapse can clear the
  floor score. The LLM extracts residual evidence; deterministic code decides.
- **Judgments** record model + prompt version; the **event_log** is the audit trail.
- LLM cost is the user's own (BYO key), so there is no server-side quota — the only
  bound is the per-analysis web-search budget.

## Loading real USPTO data (offline, no API key)

By default the catalogue is the bundled ~4,000-number seed. To replace fragile
Google Patents scraping with **real USPTO bulk data** — and zero registration —
run the one-time loader:

```
npm run load:uspto
```

It downloads three key-free, registration-free **Wayback-mirrored** bulk files into
`data/raw/uspto/` (gitignored, ~2 GB total, first run only): the USPTO Maintenance
Fee Events file (the dormancy hero signal) plus the PatentsView `g_patent`,
`g_assignee_disambiguated`, and `g_cpc_current` tables. It then streams them, selects
a ~35k-patent subset centered on the maintenance-fee-**lapsed** (dormant) population —
plus a still-paid control group and the VRFB anchor (US 4,786,567) — and writes a
`maintenance_event` table, fully-enriched `patent_index` rows, and immutable `fact`
rows (each carrying its source + Wayback URL + retrieval timestamp). Patents are keyed
`US…` to match the rest of the app.

After this, browsing and ingest read **local-first** and never touch the network;
Google Patents scraping is only a fallback for numbers outside the loaded subset.
Re-running is a no-op for already-loaded patents (idempotent). Tune with
`USPTO_DORMANT_CAP`, `USPTO_PAID_CAP`, `USPTO_INCLUDE_CPC=0`. The Wayback snapshots are
stale-but-real (fee 2025-03; bibliographic 2026-01) — fine for the testing phase.

> The dormancy lapse signal is the exact USPTO event code `EXP.` ("Patent Expired for
> Failure to Pay Maintenance Fees"), computed data-first in code — never by the LLM.

## Get an API key
- **Gemini** (free tier): aistudio.google.com → "Get API key"
- **OpenAI**: platform.openai.com → API keys
- **Anthropic**: console.anthropic.com → API keys

Paste it into **Settings → Bring your own model** — never into a file.

## Deploy
No secrets to configure. The one requirement is a host with a **persistent
filesystem** (Docker container, VM, Railway, Fly.io, etc.), because state lives in a
local SQLite file under `web/data/` seeded on first boot — classic serverless
functions with an ephemeral/read-only FS are not a fit. Analyze streams over SSE and
can run for tens of seconds, so allow a generous request timeout.

## Test
`npm run test` (db, scraper parser, scoring incl. VRFB regression, multi-provider web
search, and the USPTO loader: fee fixed-width parsing, biblio joins, subset selection,
and a fixture-driven end-to-end load with the VRFB PASS regression).
