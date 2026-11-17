/** One ad's totals for the reporting period, as read from a Meta Ads export. */
export type AdRow = {
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  addToCarts: number;
  purchases: number;
  /** Purchase value Meta attributes to the ad, in the account's currency. */
  revenue: number;
};

/** Creative types per ad name, e.g. { "Coffee bag close-up": ["product-forward"] }. */
export type Tags = Record<string, string[]>;

export type Rules = {
  /** The most you are happy to pay for one purchase. */
  targetCostPerPurchase: number;
  /** Below this spend, an ad is too new to judge. */
  minSpendToJudge: number;
  /** Pause an ad that has spent this much with no add-to-carts at all. */
  noCartSpendLimit: number;
  currency: string;
};

export const defaultRules: Rules = {
  targetCostPerPurchase: 30,
  minSpendToJudge: 10,
  noCartSpendLimit: 20,
  currency: "£",
};

/** A 95% range for a rate, in percent. */
export type Range = { low: number; high: number };

export type Metrics = {
  spend: number;
  impressions: number;
  clicks: number;
  addToCarts: number;
  purchases: number;
  revenue: number;
  /** Clicks per 100 impressions. */
  ctr: number | null;
  costPerPurchase: number | null;
  /** Revenue per unit of spend. */
  roas: number | null;
  /** Purchases per 100 clicks, with a 95% range showing how sure we can be. */
  purchaseRate: number | null;
  purchaseRateRange: Range | null;
};

export type Verdict = "keep" | "watch" | "pause" | "wait";

export type AdCall = {
  adName: string;
  tags: string[];
  verdict: Verdict;
  reason: string;
  metrics: Metrics;
};

export type TagSummary = {
  tag: string;
  ads: number;
  metrics: Metrics;
  /** False when this type's purchase-rate range doesn't overlap the best type's, so the gap is unlikely to be chance. */
  overlapsBest: boolean | null;
};
