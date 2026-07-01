// scripts/uspto/config.ts
// Why: single source of truth for the pinned, key-free Wayback URLs and the load knobs.
// Env overrides (esp. *_PATH) let tests point the loader at tiny local fixtures instead
// of downloading 2 GB of zips.
import path from "node:path";

export const VRFB = "4786567"; // canonical PASS anchor (US 4,786,567)

export const SOURCES = {
  fee: {
    url: "https://web.archive.org/web/20250307054347/https://bulkdata.uspto.gov/data/patent/maintenancefee/MaintFeeEvents.zip",
    zipName: "MaintFeeEvents.zip",
    entryMatch: (n: string) => /MaintFeeEvents.*\.txt$/i.test(n),
  },
  gPatent: {
    url: "https://web.archive.org/web/20260109004531/https://s3.amazonaws.com/data.patentsview.org/download/g_patent.tsv.zip",
    zipName: "g_patent.tsv.zip",
    entryMatch: (n: string) => /g_patent\.tsv$/i.test(n),
  },
  assignee: {
    url: "https://web.archive.org/web/20260109004531/https://s3.amazonaws.com/data.patentsview.org/download/g_assignee_disambiguated.tsv.zip",
    zipName: "g_assignee_disambiguated.tsv.zip",
    entryMatch: (n: string) => /g_assignee_disambiguated\.tsv$/i.test(n),
  },
  cpc: {
    url: "https://web.archive.org/web/20260109004531/https://s3.amazonaws.com/data.patentsview.org/download/g_cpc_current.tsv.zip",
    zipName: "g_cpc_current.tsv.zip",
    entryMatch: (n: string) => /g_cpc_current\.tsv$/i.test(n),
  },
} as const;

export function loaderConfig() {
  const intEnv = (k: string, d: number) => { const n = parseInt(process.env[k] ?? "", 10); return Number.isFinite(n) ? n : d; };
  return {
    rawDir: path.join(process.cwd(), "data", "raw", "uspto"),
    includeCpc: process.env.USPTO_INCLUDE_CPC !== "0",   // default ON (spec: include CPC)
    dormantCap: intEnv("USPTO_DORMANT_CAP", 30_000),
    paidCap: intEnv("USPTO_PAID_CAP", 5_000),
    vrfb: VRFB,
    localPaths: {
      fee: process.env.USPTO_FEE_PATH,
      gPatent: process.env.USPTO_GPATENT_PATH,
      assignee: process.env.USPTO_ASSIGNEE_PATH,
      cpc: process.env.USPTO_CPC_PATH,
    },
  };
}
