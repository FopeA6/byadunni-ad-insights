import { describe, expect, test } from "vitest";
import { parseCsv } from "../src/csv.js";
import { importMetaCsv, parseTags, toNumber } from "../src/import-meta.js";

describe("parseCsv", () => {
  test("handles quotes, commas and doubled quotes inside quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n')).toEqual([["a", "b, c", 'say "hi"']]);
  });

  test("handles Windows line endings, a byte-order mark and blank lines", () => {
    expect(parseCsv("﻿x,y\r\n1,2\r\n\r\n3,4")).toEqual([["x", "y"], ["1", "2"], ["3", "4"]]);
  });

  test("keeps empty fields", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("toNumber", () => {
  test("cleans the formats spreadsheets produce", () => {
    expect(toNumber("1,234.50")).toBe(1234.5);
    expect(toNumber("£12")).toBe(12);
    expect(toNumber("")).toBe(0);
    expect(toNumber("-")).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });
});

describe("importMetaCsv", () => {
  const header = "Ad name,Amount spent (GBP),Impressions,Link clicks,Adds to cart,Purchases,Purchases conversion value";

  test("reads one row per ad, treating blanks as zero", () => {
    expect(importMetaCsv(`${header}\nA,10.50,1000,40,2,,\n`)).toEqual([
      { adName: "A", spend: 10.5, impressions: 1000, clicks: 40, addToCarts: 2, purchases: 0, revenue: 0 },
    ]);
  });

  test("adds up rows for the same ad, as in a day-by-day export", () => {
    const [ad] = importMetaCsv(`${header}\nA,5,100,4,1,1,130\nA,7.25,200,6,0,0,0\n`);
    expect(ad).toEqual({ adName: "A", spend: 12.25, impressions: 300, clicks: 10, addToCarts: 1, purchases: 1, revenue: 130 });
  });

  test("matches column names without case and with other currencies", () => {
    const [ad] = importMetaCsv("AD NAME,Amount Spent (USD),Purchases\nB,20,1\n");
    expect(ad).toMatchObject({ adName: "B", spend: 20, purchases: 1, clicks: 0 });
  });

  test("a missing required column names what it found", () => {
    expect(() => importMetaCsv("Campaign name,Impressions\nX,10\n")).toThrow(
      'Missing column(s): ad name, amount spent. Columns found: "Campaign name", "Impressions".',
    );
  });

  test("skips rows with no ad name, such as a totals row", () => {
    expect(importMetaCsv(`${header}\n,100,1,1,1,1,1\nA,1,1,1,1,1,1\n`)).toHaveLength(1);
  });
});

describe("parseTags", () => {
  test("lower-cases and trims tags", () => {
    expect(parseTags({ "Ad one": [" Product-Forward "] })).toEqual({ "Ad one": ["product-forward"] });
  });

  test("rejects the wrong shape", () => {
    expect(() => parseTags(["x"])).toThrow("JSON object");
    expect(() => parseTags({ A: "styling" })).toThrow('Tags for "A"');
  });
});
