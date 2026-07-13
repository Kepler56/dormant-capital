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
   Filter by keyword, assignee, grant-year range, CPC class, maintenance-fee status
   (dormant / maintained), USPTO entity status (large / small / micro), a human-friendly
   **Sector** dropdown (Medicine, Computing, Communications, Electronics, Energy, Optics,
   Chemistry, Mechanical, Transport — a curated CPC-prefix mapping), **Lapse age** (how
   recently a maintenance fee lapsed: ≤2y "revival window" / ≤5y / 5+ years old), and
   **Analysis** status (analyzed / not analyzed / by scoring route: License-Acquire,
   Revival, Public-domain intel, Tech info), then sort by patent number or grant year —
   all server-side over the whole ~35k-patent catalogue, not just the visible page.
   Every filter, the sort, and the current page round-trip through the URL, so
   **Search → open a patent → Back** always restores exactly where you left off.
2. **Click a row** — the patent is pulled in from local facts and you land on its
   detail page automatically. Or select several rows' checkboxes and **Analyze
   selected** to batch-run up to 10 patents sequentially, with a per-row live SSE
   progress list — one row failing (bad key, transient provider error) never kills
   the rest of the queue.
3. **Detail page** — shows the route badge (see Scoring v2 below), the four split
   score chips, sourced facts, LLM evidence cards, and every past **Analysis run**
   in one table so you can compare how different engines scored the same patent
   side by side. Press **Analyze** to run (or re-run) the agentic scorer live.
   Below that: a **Buyer fit** panel (score this patent against any saved mandate)
   and a **Deal journey** log (one row per buyer-outcome step, from "Owner
   identified" through "Closed"/"Rejected" — a reason code is mandatory on either
   terminal event).
4. **Mandates page** — record a buyer's standing thesis (name + free-text criteria);
   it then shows up as a scoring target on every patent's Buyer fit panel.
5. **Settings — Bring your own model** — pick a provider, paste a key, save it as a
   named engine profile. Required before Analyze/batch-analyze/buyer-fit works;
   there is no shared server model.

## Bring your own model (any provider)
The agentic scorer is provider-agnostic. Whatever you configure runs *both* the
structured reasoning and the grounded **web search**:
- **Gemini** → Google Search grounding
- **OpenAI** → the Responses API `web_search` tool
- **Anthropic** → the `web_search` server tool

Web search is bounded: at most `MAX_WEB_SEARCHES` (4) searches per analysis, ≤5
results each, each call timeout-guarded. If a chosen model doesn't support web
search, that step degrades gracefully to "ungrounded" rather than failing.

Save as many named **engine profiles** as you like (any mix of OpenAI / Anthropic /
Gemini + model + key) and pick which one runs each analysis — handy for comparing
how different models score the same patent (see **Analysis runs** on the detail
page). Model-compatibility quirks are handled automatically: a provider 400 for
"temperature not supported" (reasoning models like `o1`/`o3`/`gpt-5*`) triggers a
one-time silent retry without the parameter, learned per model for the rest of the
session; a bad key, an unknown model id, or a zero-quota plan fails fast with a
plain-language message instead of grinding through retries or surfacing a raw
provider stack trace.

## How it works
- **Catalogue backbone** (`/api/index`): a local SQLite table backs the Patents table,
  populated by the USPTO bulk loader below (~35k patents, titles/assignees/facts already
  filled). A small bundled seed is used if the loader hasn't run. Browsing never touches
  the network; filtering (keyword/assignee/year/CPC class/maintenance status/entity
  status/sector/lapse age/analysis status & route) and sorting are all SQLite,
  server-side, over the full catalogue.
- **Facts** (immutable, sourced) come from the USPTO bulk data on load; for any patent
  outside the loaded subset, ingest falls back to a Google Patents page scrape.
- **Gate 0 (transactability)** runs first, facts-only: is this asset even legally
  transactable, and what's the route? Then the **dormancy gate** — data-first, only a
  maintenance-fee lapse can clear the floor score. The LLM extracts residual/opportunity/
  execution/buyer-fit *evidence* in every case; deterministic code alone turns evidence
  into scores (see **Scoring v2** below).
- **Judgments** record model + prompt version per dimension (dormancy, transactability,
  opportunity, execution, buyer_fit, shadow); the **event_log** is the append-only audit
  trail (`score_computed` carries the full result + agent trace + which engine ran it;
  `outcome_logged` and `buyer_fit_computed` cover the newer flows below).
- LLM cost is the user's own (BYO key), so there is no server-side quota — the only
  bound is the per-analysis web-search budget.

## Scoring v2

Every weight, threshold and band lives in **`src/lib/scoring/config.ts`** and nowhere
else — calibration is a config edit, never a model or code change.

**Gate 0 — transactability (facts only, no LLM).** Before anything else, is this asset
even legally sellable, and what's the route? Runs on dated facts alone (grant/expiry/
maintenance-fee history) — never an LLM judgment call:

| Route | Meaning | Transactability score |
|---|---|---|
| `LICENSE_OR_ACQUIRE` | In force, clean license/acquisition candidate | 90 (45 if <3 yrs term left) |
| `REVIVAL` | Fee lapse on record, plausibly unintentional-delay-restorable | 55 |
| `REVIVAL` *(stale)* | Lapse older than the 2-year restoration window — low odds | 35 |
| `PUBLIC_DOMAIN_INTEL` | Full term expired — no exclusivity, sell tech intelligence instead | 15 |
| `TECH_INFO` | Application never granted — no subsisting rights | 5 |
| `UNKNOWN` | Insufficient dated facts to classify | 30 |

Every `REVIVAL` route is auto-flagged `needs_legal_verification` — restoration realism,
unintentional-delay standing, clean chain of title and claim validity all have to be
checked by a human before anything is transacted; the app never hard-codes that
verification as done.

**The dormancy gate (floor 40, unchanged).** Still data-first: only a maintenance-fee
lapse (`maintenanceLapsed`) can clear the floor, and the residual-evidence nudges below
only ever apply on top of that hero signal — they can never open the gate alone (the
VRFB guarantee: an actively-maintained patent can never be scored as dormant).

| Signal | Points |
|---|---|
| Base | 20 |
| Maintenance-fee lapse (hero signal) | +55 |
| Stale lapse (>2 yrs, settled abandonment) | +8 |
| No live product on the market | +12 |
| No active development found | +10 |
| Active litigation on record | −40 |

**Split score outputs.** When Gate 0 says transactable and the dormancy gate passes,
four numbers are reported (never blended into one hidden figure):

- **Dormancy** — how clearly the owner has walked away (the gate score above).
- **Transactability** — Gate 0's score (legally clean / available exclusivity).
- **Opportunity** — market relevance, from LLM evidence bands (high **85** / medium
  **55** / low **20**).
- **Execution** — acquirability; time-component is 80 (active) / 45 (fee-lapsed,
  recoverable) / 25 (term-expired, unusable as exclusive IP).

**Composite & routing bands** (only computed once both gates pass):
`composite = 0.40·Dormancy + 0.35·Opportunity + 0.25·Execution`, then:
`≥70 → ROUTE`, `50–69 → WATCH`, `<50 → PASS`. A non-transactable or non-dormant asset
exits before this layer with `composite: null` — Opportunity/Execution meaning is never
spent on an asset that isn't even a candidate.

**Buyer-Fit (per mandate, demand-first).** The LLM extracts thesis-alignment evidence
against a saved buyer mandate (never a bare number); the same high/medium/low band
points map it to a score, with one hard rule: a `blocking_mismatch` (wrong domain,
wrong geography, incompatible tech) floors the score at the "low" band regardless of
how well the thesis otherwise reads, and the disqualifying snippet is always surfaced.

**Shadow check.** A second, independent LLM pass proposes its own composite; if it
diverges from the deterministic score by more than **15 points** it's flagged
"differ" — informational only, it never changes the verdict.

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

## Data layer

State lives in **libSQL** (SQLite-compatible). The *same* code runs everywhere:
- **local dev / tests** → a local `file:data/dormant.db` (or `:memory:` under Vitest)
- **production** → a hosted **Turso** database, set via `TURSO_DATABASE_URL` +
  `TURSO_AUTH_TOKEN`

No filesystem persistence is required in production, so it deploys to serverless
(Vercel) as well as any long-running host.

## Deploy to Vercel (with Turso)

1. **Create a Turso database** (browser only — no CLI needed): sign up at
   [turso.tech](https://turso.tech) → create a database → copy its **URL** and generate an
   **auth token**. (On Windows the Turso CLI needs WSL; this dashboard route avoids it.)
2. **Push your local catalogue into it** (you already have `data/dormant.db` from
   `npm run load:uspto`). In PowerShell:
   ```powershell
   $env:TURSO_DATABASE_URL="libsql://<db>-<org>.turso.io"
   $env:TURSO_AUTH_TOKEN="<token>"
   npm run push:turso
   ```
   `push:turso` bulk-copies every table from the local file into Turso in batches
   (~35k patents in a minute or two) — no CLI, no re-download. Idempotent, so re-running
   only fills gaps.
3. **Import the GitHub repo** into Vercel (Framework preset: Next.js — auto-detected).
4. **Add two Environment Variables** in the Vercel project: `TURSO_DATABASE_URL` and
   `TURSO_AUTH_TOKEN`. (No LLM keys — those stay bring-your-own, entered in the UI.)
5. **Deploy.** `/api/analyze` declares `maxDuration = 300`; the long streaming run needs
   a Vercel **Pro** plan to use the full 300s (Hobby caps at 60s).
6. Open the site → **Settings → Bring your own model** → paste a key → analyze.

> Have the Turso CLI (macOS/Linux/WSL)? You can skip step 2 with a one-shot file import:
> `turso db create dormant-capital --from-file ./data/dormant.db`.
>
> Prefer a single long-running host instead? It also runs as-is on Railway / Render /
> Fly.io — point `TURSO_DATABASE_URL` at Turso, or drop it and mount a volume so the
> default `file:data/dormant.db` persists.

## Test
`npm run test` — 31 test files, 169 tests: db, scraper parser, scoring v2 (Gate 0
routing, the dormancy gate + VRFB floor regression, opportunity/execution/buyer-fit
mappers, compose), the agent graph, model-compat (per-provider temperature handling,
the auto-recovery retry, provider-error classification), multi-provider web search,
patent-index filters/sort, outcomes (mandatory reason code on terminal events),
mandates, and the USPTO loader (fee fixed-width parsing, biblio joins, subset
selection, and a fixture-driven end-to-end load with the VRFB PASS regression).
