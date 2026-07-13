// index/sectors.ts
// Why: buyers think in sectors, not CPC codes. A sector is a fixed, server-side
// whitelist of CPC prefixes ORed together — the user picks "Medicine", we expand it.
// Dependency-free so the client component can import the labels for the select without
// pulling in any server-only module.
export const SECTORS = {
  medicine:       { label: "Medicine & biotech",        prefixes: ["A61", "C07K", "C12N", "C12Q", "C12M", "G16H"] },
  computing:      { label: "Computing & software",      prefixes: ["G06"] },
  communications: { label: "Communications & networking", prefixes: ["H04"] },
  electronics:    { label: "Semiconductors & electronics", prefixes: ["H01", "H10", "H05", "G11"] },
  energy:         { label: "Energy & climate tech",     prefixes: ["Y02E", "H01M", "H02J", "H02S", "F03B", "F03D", "F24S", "F24T"] },
  optics:         { label: "Optics & imaging",          prefixes: ["G02", "G03", "H04N"] },
  chemistry:      { label: "Chemistry & materials",     prefixes: ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C22", "C23"] },
  mechanical:     { label: "Mechanical & manufacturing", prefixes: ["B21", "B22", "B23", "B24", "B25", "B26", "B29", "B32", "B33", "F15", "F16"] },
  transport:      { label: "Transport & mobility",      prefixes: ["B60", "B61", "B62", "B63", "B64", "Y02T"] },
} as const;
export type SectorKey = keyof typeof SECTORS;
export const SECTOR_KEYS = Object.keys(SECTORS) as SectorKey[];
