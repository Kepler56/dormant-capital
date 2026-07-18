// lib/patents/filters.ts
// Why: the patent catalogue's filter state is URL-canonical — the query string IS the store.
// That vocabulary now has two readers on opposite sides of the server/client line: the
// PatentSearch client component (which writes it and parses it back) and the patent detail
// Server Component (which round-trips it through a `from` param so "Back to patents" returns
// to the filtered list the user actually came from). Keeping buildQS/filtersFromParams in one
// dependency-free module is what stops those two from drifting — a new filter added to the
// serializer is automatically understood, and automatically preserved, by the back link.
//
// This module must stay pure: no @/lib/db, no server-only imports, no React. `@/lib/index/sectors`
// is dependency-free plain constants and is safe in both environments.
import { SECTORS, SECTOR_KEYS } from "@/lib/index/sectors";

export type Filters = {
  q: string; assignee: string; yearAfter: string; yearBefore: string;
  cpc: string; entityStatus: "" | "large" | "small" | "micro"; status: "" | "lapsed" | "maintained";
  sector: "" | keyof typeof SECTORS;
  lapseAge: "" | "recent2" | "recent5" | "stale5";
  analysis: "" | "analyzed" | "not_analyzed" | "route_license" | "route_revival" | "route_pdi" | "route_tech";
  sort: "number" | "year_desc" | "year_asc";
};

export const INITIAL: Filters = {
  q: "", assignee: "", yearAfter: "", yearBefore: "",
  cpc: "", entityStatus: "", status: "",
  sector: "", lapseAge: "", analysis: "",
  sort: "number",
};

export function buildQS(f: Filters, page: number): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.assignee.trim()) p.set("assignee", f.assignee.trim());
  if (f.yearAfter.trim()) p.set("yearAfter", f.yearAfter.trim());
  if (f.yearBefore.trim()) p.set("yearBefore", f.yearBefore.trim());
  if (f.cpc.trim()) p.set("cpc", f.cpc.trim());
  if (f.entityStatus) p.set("entityStatus", f.entityStatus);
  if (f.status) p.set("status", f.status);
  if (f.sector) p.set("sector", f.sector);
  if (f.lapseAge) p.set("lapseAge", f.lapseAge);
  if (f.analysis) p.set("analysis", f.analysis);
  if (f.sort !== "number") p.set("sort", f.sort);
  p.set("page", String(page));
  return p.toString();
}

const ENTITY_STATUS_VALUES = new Set(["large", "small", "micro"]);
const STATUS_VALUES = new Set(["lapsed", "maintained"]);
const SECTOR_VALUES = new Set<string>(SECTOR_KEYS);
const LAPSE_AGE_VALUES = new Set(["recent2", "recent5", "stale5"]);
const ANALYSIS_VALUES = new Set([
  "analyzed", "not_analyzed", "route_license", "route_revival", "route_pdi", "route_tech",
]);
const SORT_VALUES = new Set(["number", "year_desc", "year_asc"]);

// Inverse of buildQS: parse a URL's query params back into { filters, page }, falling back to
// INITIAL/0 for anything missing or invalid (bogus enum values, non-numeric page). One
// vocabulary shared by fetch and address bar, so the URL is always a faithful round-trip.
export function filtersFromParams(sp: URLSearchParams): { filters: Filters; page: number } {
  const entityStatus = sp.get("entityStatus") ?? "";
  const status = sp.get("status") ?? "";
  const sector = sp.get("sector") ?? "";
  const lapseAge = sp.get("lapseAge") ?? "";
  const analysis = sp.get("analysis") ?? "";
  const sort = sp.get("sort") ?? "number";
  const filters: Filters = {
    q: sp.get("q") ?? "",
    assignee: sp.get("assignee") ?? "",
    yearAfter: sp.get("yearAfter") ?? "",
    yearBefore: sp.get("yearBefore") ?? "",
    cpc: sp.get("cpc") ?? "",
    entityStatus: ENTITY_STATUS_VALUES.has(entityStatus) ? (entityStatus as Filters["entityStatus"]) : "",
    status: STATUS_VALUES.has(status) ? (status as Filters["status"]) : "",
    sector: SECTOR_VALUES.has(sector) ? (sector as Filters["sector"]) : "",
    lapseAge: LAPSE_AGE_VALUES.has(lapseAge) ? (lapseAge as Filters["lapseAge"]) : "",
    analysis: ANALYSIS_VALUES.has(analysis) ? (analysis as Filters["analysis"]) : "",
    sort: SORT_VALUES.has(sort) ? (sort as Filters["sort"]) : "number",
  };
  const rawPage = sp.get("page");
  const parsedPage = rawPage === null ? 0 : Number.parseInt(rawPage, 10);
  const page = Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;
  return { filters, page };
}

// Build the "Back to patents" href from a `from` param carried on the detail URL.
//
// Input is a plain query string: callers percent-encode when writing the link, and Next's
// `searchParams` decodes it once before it reaches here. Do not decode again.
//
// Why launder it through filtersFromParams → buildQS instead of concatenating the raw string:
// `from` arrives from the address bar and is user-controlled, and its only job is to become an
// href. Round-tripping it through the parser drops every key that isn't a known filter and
// every enum value that isn't in the whitelist, so the result is always a query string this
// app wrote itself. The path is a hardcoded literal, so no value of `from` can retarget the
// link off-route or off-origin. Anything unusable degrades to the bare "/patents".
export function patentsHrefFrom(from: string | string[] | undefined): string {
  if (typeof from !== "string" || !from) return "/patents";
  const { filters, page } = filtersFromParams(new URLSearchParams(from));
  const qs = buildQS(filters, page);
  // buildQS always emits page=N; a bare "page=0" with no filters means there was nothing to keep.
  return qs === "page=0" ? "/patents" : `/patents?${qs}`;
}
