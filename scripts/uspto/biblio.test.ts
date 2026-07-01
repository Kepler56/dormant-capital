import { describe, it, expect } from "vitest";
import { headerIndex, parseGPatent, parseAssignee, parseCpc } from "./biblio";

const split = (s: string) => s.split("\t");

describe("biblio TSV parsers", () => {
  it("parses g_patent row -> number/title/grantDate", () => {
    const idx = headerIndex("patent_id\tpatent_type\tpatent_date\tpatent_title\twipo_kind");
    const r = parseGPatent(split("4786567\tutility\t1988-11-22\tAll-vanadium redox battery\tB1"), idx)!;
    expect(r).toEqual({ number: "4786567", title: "All-vanadium redox battery", grantDate: "1988-11-22" });
  });
  it("parses g_assignee_disambiguated row -> org + sequence", () => {
    const idx = headerIndex("patent_id\tassignee_sequence\tassignee_id\tdisambig_assignee_individual_name_first\tdisambig_assignee_individual_name_last\tdisambig_assignee_organization\tassignee_type\tlocation_id");
    const r = parseAssignee(split("4786567\t0\tabc\t\t\tUnisearch Ltd\t3\tloc1"), idx)!;
    expect(r).toEqual({ number: "4786567", sequence: 0, org: "Unisearch Ltd" });
  });
  it("parses g_cpc_current row -> symbol + sequence", () => {
    const idx = headerIndex("patent_id\tcpc_sequence\tcpc_section\tcpc_class\tcpc_subclass\tcpc_group\tcpc_type");
    const r = parseCpc(split("4786567\t0\tH\t01\tH01M\tH01M8/188\tinventional"), idx)!;
    expect(r).toEqual({ number: "4786567", sequence: 0, symbol: "H01M8/188" });
  });
  it("rejects a non-utility patent_id", () => {
    const idx = headerIndex("patent_id\tpatent_type\tpatent_date\tpatent_title");
    expect(parseGPatent(split("RE40000\tutility\t1988-11-22\tFoo"), idx)).toBeNull();
  });
  it("falls back to individual first+last name when org is empty", () => {
    const idx = headerIndex("patent_id\tassignee_sequence\tassignee_id\tdisambig_assignee_individual_name_first\tdisambig_assignee_individual_name_last\tdisambig_assignee_organization\tassignee_type\tlocation_id");
    const r = parseAssignee(split("4786567\t0\tabc\tJohn\tDoe\t\t1\tloc1"), idx)!;
    expect(r).toEqual({ number: "4786567", sequence: 0, org: "John Doe" });
  });
  // Real PatentsView dumps QUOTE every string field (header AND cells); numeric fields are
  // bare. The parser must strip surrounding double-quotes or every column lookup misses.
  it("parses REAL quoted PatentsView rows (strips surrounding quotes from header and cells)", () => {
    const gIdx = headerIndex('"patent_id"\t"patent_type"\t"patent_date"\t"patent_title"\t"wipo_kind"');
    const g = parseGPatent(split('"10000000"\t"utility"\t"2018-06-19"\t"Coherent LADAR"\t"B2"'), gIdx)!;
    expect(g).toEqual({ number: "10000000", title: "Coherent LADAR", grantDate: "2018-06-19" });

    const aIdx = headerIndex('"patent_id"\t"assignee_sequence"\t"assignee_id"\t"disambig_assignee_individual_name_first"\t"disambig_assignee_individual_name_last"\t"disambig_assignee_organization"\t"assignee_type"\t"location_id"');
    const a = parseAssignee(split('"4488683"\t0\t"abc"\t""\t""\t"Metal Works Ramat David"\t3\t"loc"'), aIdx)!;
    expect(a).toEqual({ number: "4488683", sequence: 0, org: "Metal Works Ramat David" });
  });
});
