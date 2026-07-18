// Why: these lock the contract the patent detail page's "Back to patents" link depends on.
// The link's href is built from a `from` param that arrives off the address bar, so the two
// things that matter are (a) a genuine filter state survives the round-trip intact — that IS
// the bug this module was extracted to fix — and (b) nothing an attacker puts in `from` can
// retarget the link or smuggle keys through.
import { describe, it, expect } from "vitest";
import { buildQS, filtersFromParams, patentsHrefFrom, INITIAL } from "./filters";

// Callers write `?from=${encodeURIComponent(buildQS(...))}`, but Next's `searchParams` hands the
// page the value already percent-decoded — so patentsHrefFrom's input is a plain query string,
// and these tests pass it that way. Encoding here instead would collapse the whole thing into a
// single bogus key and silently test nothing.
const asFromParam = (f: Parameters<typeof buildQS>[0], page = 0) => buildQS(f, page);

describe("patentsHrefFrom", () => {
  it("preserves a real filter state so the back link returns to the filtered list", () => {
    const href = patentsHrefFrom(asFromParam({ ...INITIAL, q: "battery", sector: "energy", status: "lapsed" }, 2));
    const sp = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/patents?")).toBe(true);
    expect(sp.get("q")).toBe("battery");
    expect(sp.get("status")).toBe("lapsed");
    expect(sp.get("page")).toBe("2");
  });

  it("round-trips back to an identical filter object", () => {
    const filters = { ...INITIAL, assignee: "Acme Corp", lapseAge: "recent5" as const, sort: "year_desc" as const };
    const href = patentsHrefFrom(asFromParam(filters));
    expect(filtersFromParams(new URLSearchParams(href.split("?")[1])).filters).toEqual(filters);
  });

  it("falls back to the bare list when there is no filter context", () => {
    // Arrivals from the dashboard or a pasted URL carry no `from` at all.
    expect(patentsHrefFrom(undefined)).toBe("/patents");
    expect(patentsHrefFrom("")).toBe("/patents");
    // An unfiltered page-0 state is not worth a query string either.
    expect(patentsHrefFrom(asFromParam(INITIAL))).toBe("/patents");
  });

  it("drops unknown keys and invalid enum values instead of echoing them into the href", () => {
    const href = patentsHrefFrom("q=laser&evil=payload&sector=not_a_sector&status=bogus");
    const sp = new URLSearchParams(href.split("?")[1]);
    expect(sp.get("q")).toBe("laser");
    expect(sp.has("evil")).toBe(false);
    expect(sp.has("sector")).toBe(false);
    expect(sp.has("status")).toBe(false);
  });

  it("cannot be steered off-route or off-origin", () => {
    // The path is a hardcoded literal, so hostile `from` values stay same-origin under /patents.
    for (const hostile of [
      "https://evil.com",
      "//evil.com",
      "../../admin",
      "javascript:alert(1)",
      "q=x#@evil.com",
    ]) {
      expect(patentsHrefFrom(hostile).startsWith("/patents")).toBe(true);
    }
  });

  it("ignores a repeated ?from= (array) rather than trusting the first value", () => {
    expect(patentsHrefFrom(["q=a", "q=b"])).toBe("/patents");
  });

  it("treats a malformed page as page 0", () => {
    expect(patentsHrefFrom("q=x&page=-5")).toBe("/patents?q=x&page=0");
    expect(patentsHrefFrom("q=x&page=abc")).toBe("/patents?q=x&page=0");
  });
});
