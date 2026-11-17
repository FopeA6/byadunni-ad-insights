import { describe, expect, test } from "vitest";
import { callAds, callFor, compareCreativeTypes, metricsFor } from "../src/analysis.js";
import { wilsonRange } from "../src/stats.js";
import { defaultRules, type AdRow } from "../src/types.js";

const rules = defaultRules; // £30 target, judge from £10, pause at £20 with no carts

function ad(overrides: Partial<AdRow>): AdRow {
  return { adName: "Ad", spend: 0, impressions: 1000, clicks: 50, addToCarts: 0, purchases: 0, revenue: 0, ...overrides };
}

describe("wilsonRange", () => {
  test("matches the textbook 95% range for 5 out of 100", () => {
    expect(wilsonRange(5, 100)).toEqual({ low: 2.2, high: 11.2 });
  });

  test("gives a real range at zero, where a naive formula says 0–0%", () => {
    expect(wilsonRange(0, 20)).toEqual({ low: 0, high: 16.1 });
  });

  test("shows how little 1 out of 10 tells you", () => {
    expect(wilsonRange(1, 10)).toEqual({ low: 1.8, high: 40.4 });
  });

  test("no range when there are no clicks or the counts don't make sense", () => {
    expect(wilsonRange(0, 0)).toBeNull();
    expect(wilsonRange(3, 2)).toBeNull();
  });
});

describe("metricsFor", () => {
  test("works out rates and money, rounded", () => {
    const m = metricsFor(ad({ spend: 64.2, impressions: 9800, clicks: 210, addToCarts: 14, purchases: 3, revenue: 405 }));
    expect(m).toMatchObject({ ctr: 2.14, costPerPurchase: 21.4, roas: 6.31, purchaseRate: 1.4 });
  });

  test("never divides by zero", () => {
    const m = metricsFor(ad({ spend: 0, impressions: 0, clicks: 0 }));
    expect(m).toMatchObject({ ctr: null, costPerPurchase: null, roas: null, purchaseRate: null, purchaseRateRange: null });
  });

  test("more purchases than clicks (view-through) gives no purchase rate rather than over 100%", () => {
    expect(metricsFor(ad({ clicks: 1, purchases: 2, spend: 10 })).purchaseRate).toBeNull();
  });
});

describe("callFor", () => {
  const call = (overrides: Partial<AdRow>) => callFor(metricsFor(ad(overrides)), rules);

  test("wait: too little spend to judge", () => {
    expect(call({ spend: 7.4, addToCarts: 0 })).toEqual({
      verdict: "wait",
      reason: "Only £7.40 spent. Too early to judge; look again at £10.00.",
    });
  });

  test("pause: spent the no-cart limit with no add-to-carts", () => {
    expect(call({ spend: 20 }).verdict).toBe("pause");
    expect(call({ spend: 19.99 }).verdict).toBe("wait");
  });

  test("pause: twice the target spent with carts but no purchases", () => {
    expect(call({ spend: 60, addToCarts: 3 })).toEqual({
      verdict: "pause",
      reason: "£60.00 spent, over twice your £30.00 target, with no purchases.",
    });
  });

  test("keep: within target, with a caution when there are few purchases", () => {
    expect(call({ spend: 29.1, addToCarts: 4, purchases: 1 }).reason).toContain("promising, not proven");
    expect(call({ spend: 64.2, addToCarts: 14, purchases: 3 }).reason).not.toContain("promising");
    expect(call({ spend: 30, addToCarts: 1, purchases: 1 }).verdict).toBe("keep");
  });

  test("watch: purchases, but above target", () => {
    expect(call({ spend: 38.5, addToCarts: 6, purchases: 1 })).toEqual({
      verdict: "watch",
      reason: "£38.50 per purchase, above your £30.00 target.",
    });
  });

  test("wait: some carts, no purchase, not yet at the limit", () => {
    expect(call({ spend: 15.3, addToCarts: 2 }).reason).toBe("2 add-to-carts but no purchase yet. Judge again at £60.00 spent.");
  });
});

describe("callAds", () => {
  test("pause comes first, then keep, watch and wait; higher spend first within each", () => {
    const calls = callAds(
      [
        ad({ adName: "small wait", spend: 5 }),
        ad({ adName: "keeper", spend: 40, addToCarts: 5, purchases: 2 }),
        ad({ adName: "pause small", spend: 25 }),
        ad({ adName: "pause big", spend: 45 }),
      ],
      { keeper: ["product-forward"] },
      rules,
    );
    expect(calls.map((c) => c.adName)).toEqual(["pause big", "pause small", "keeper", "small wait"]);
    expect(calls.find((c) => c.adName === "small wait")?.tags).toEqual(["untagged"]);
  });
});

describe("compareCreativeTypes", () => {
  test("an ad with two tags counts towards both, and types are sorted by cost per purchase", () => {
    const rows = compareCreativeTypes(
      [
        ad({ adName: "a", spend: 30, clicks: 100, purchases: 2, revenue: 260 }),
        ad({ adName: "b", spend: 40, clicks: 100, purchases: 1, revenue: 130 }),
        ad({ adName: "c", spend: 20, clicks: 100, purchases: 0 }),
      ],
      { a: ["product", "styling"], b: ["styling"], c: ["process"] },
    );
    expect(rows.map((r) => [r.tag, r.ads, r.metrics.costPerPurchase])).toEqual([
      ["product", 1, 15],
      ["styling", 2, 23.33],
      ["process", 1, null],
    ]);
  });

  test("flags a type as clearly behind only when its range doesn't overlap the best one's", () => {
    const rows = compareCreativeTypes(
      [
        ad({ adName: "strong", spend: 100, clicks: 400, purchases: 40 }),
        ad({ adName: "weak", spend: 100, clicks: 400, purchases: 4 }),
        ad({ adName: "close", spend: 100, clicks: 400, purchases: 35 }),
      ],
      { strong: ["a"], weak: ["b"], close: ["c"] },
    );
    const byTag = Object.fromEntries(rows.map((r) => [r.tag, r.overlapsBest]));
    expect(byTag).toEqual({ a: null, b: false, c: true });
  });
});
