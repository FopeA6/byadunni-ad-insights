import { rangesOverlap, round, wilsonRange } from "./stats.js";
import type { AdCall, AdRow, Metrics, Rules, TagSummary, Tags, Verdict } from "./types.js";

type Totals = Pick<AdRow, "spend" | "impressions" | "clicks" | "addToCarts" | "purchases" | "revenue">;

export function metricsFor(t: Totals): Metrics {
  const validRate = t.clicks > 0 && t.purchases <= t.clicks;
  return {
    spend: round(t.spend, 2),
    impressions: t.impressions,
    clicks: t.clicks,
    addToCarts: t.addToCarts,
    purchases: t.purchases,
    revenue: round(t.revenue, 2),
    ctr: t.impressions > 0 ? round((t.clicks / t.impressions) * 100, 2) : null,
    costPerPurchase: t.purchases > 0 ? round(t.spend / t.purchases, 2) : null,
    roas: t.spend > 0 ? round(t.revenue / t.spend, 2) : null,
    purchaseRate: validRate ? round((t.purchases / t.clicks) * 100, 1) : null,
    purchaseRateRange: validRate ? wilsonRange(t.purchases, t.clicks) : null,
  };
}

function money(value: number, rules: Rules): string {
  return `${rules.currency}${value.toFixed(2)}`;
}

/** Turns one ad's numbers into a keep, watch, pause or wait call, with the reason in plain words. */
export function callFor(m: Metrics, rules: Rules): { verdict: Verdict; reason: string } {
  const target = rules.targetCostPerPurchase;
  const spent = money(m.spend, rules);

  if (m.spend < rules.minSpendToJudge) {
    return { verdict: "wait", reason: `Only ${spent} spent. Too early to judge; look again at ${money(rules.minSpendToJudge, rules)}.` };
  }
  if (m.addToCarts === 0 && m.spend >= rules.noCartSpendLimit) {
    return { verdict: "pause", reason: `${spent} spent with no add-to-carts. People aren't getting as far as the bag.` };
  }
  if (m.purchases === 0 && m.spend >= 2 * target) {
    return { verdict: "pause", reason: `${spent} spent, over twice your ${money(target, rules)} target, with no purchases.` };
  }
  if (m.costPerPurchase !== null && m.costPerPurchase <= target) {
    const caution =
      m.purchases < 3
        ? ` Based on only ${m.purchases} purchase${m.purchases === 1 ? "" : "s"}, so promising, not proven.`
        : "";
    return { verdict: "keep", reason: `${money(m.costPerPurchase, rules)} per purchase, within your ${money(target, rules)} target.${caution}` };
  }
  if (m.costPerPurchase !== null) {
    return { verdict: "watch", reason: `${money(m.costPerPurchase, rules)} per purchase, above your ${money(target, rules)} target.` };
  }
  const nextCheck = money(2 * target, rules);
  return m.addToCarts > 0
    ? { verdict: "wait", reason: `${m.addToCarts} add-to-cart${m.addToCarts === 1 ? "" : "s"} but no purchase yet. Judge again at ${nextCheck} spent.` }
    : { verdict: "wait", reason: `No add-to-carts yet. Judge again at ${money(rules.noCartSpendLimit, rules)} spent.` };
}

const VERDICT_ORDER: Record<Verdict, number> = { pause: 0, keep: 1, watch: 2, wait: 3 };

/** One call per ad: pause first (act on those today), then keep, watch and wait; highest spend first within each. */
export function callAds(ads: AdRow[], tags: Tags, rules: Rules): AdCall[] {
  return ads
    .map((ad) => {
      const metrics = metricsFor(ad);
      const { verdict, reason } = callFor(metrics, rules);
      return { adName: ad.adName, tags: tags[ad.adName] ?? ["untagged"], verdict, reason, metrics };
    })
    .sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || b.metrics.spend - a.metrics.spend);
}

/**
 * Adds up every ad with each creative type. An ad with two tags counts towards both.
 * Sorted by cost per purchase (cheapest first), with types that have no purchases last.
 */
export function compareCreativeTypes(ads: AdRow[], tags: Tags): TagSummary[] {
  const totals = new Map<string, Totals & { ads: number }>();
  for (const ad of ads) {
    for (const tag of tags[ad.adName] ?? ["untagged"]) {
      const t = totals.get(tag) ?? { ads: 0, spend: 0, impressions: 0, clicks: 0, addToCarts: 0, purchases: 0, revenue: 0 };
      t.ads += 1;
      t.spend += ad.spend;
      t.impressions += ad.impressions;
      t.clicks += ad.clicks;
      t.addToCarts += ad.addToCarts;
      t.purchases += ad.purchases;
      t.revenue += ad.revenue;
      totals.set(tag, t);
    }
  }

  const rows = [...totals.entries()]
    .map(([tag, t]) => ({ tag, ads: t.ads, metrics: metricsFor(t), overlapsBest: null as boolean | null }))
    .sort((a, b) => {
      const ca = a.metrics.costPerPurchase ?? Infinity;
      const cb = b.metrics.costPerPurchase ?? Infinity;
      return ca - cb || a.tag.localeCompare(b.tag);
    });

  // Compare each type's purchase-rate range with the type that has the best purchase rate.
  const best = rows
    .filter((row) => row.metrics.purchaseRate !== null)
    .sort((a, b) => (b.metrics.purchaseRate ?? 0) - (a.metrics.purchaseRate ?? 0))[0];
  for (const row of rows) {
    if (!best || row === best || !row.metrics.purchaseRateRange || !best.metrics.purchaseRateRange) continue;
    row.overlapsBest = rangesOverlap(row.metrics.purchaseRateRange, best.metrics.purchaseRateRange);
  }
  return rows;
}
