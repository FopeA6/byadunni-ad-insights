import { readFileSync } from "node:fs";
import { importMetaCsv, parseTags } from "./import-meta.js";
import { defaultRules, type AdRow, type Rules, type Tags } from "./types.js";

function numberFrom(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`"${value}" is not a usable number.`);
  return parsed;
}

export function rulesFromEnv(env: NodeJS.ProcessEnv): Rules {
  return {
    targetCostPerPurchase: numberFrom(env.TARGET_COST_PER_PURCHASE, defaultRules.targetCostPerPurchase),
    minSpendToJudge: numberFrom(env.MIN_SPEND_TO_JUDGE, defaultRules.minSpendToJudge),
    noCartSpendLimit: numberFrom(env.NO_CART_SPEND_LIMIT, defaultRules.noCartSpendLimit),
    currency: env.CURRENCY ?? defaultRules.currency,
  };
}

/** Reads the export and tags from disk each time, so a fresh export is picked up without a restart. */
export function loadData(csvPath: string, tagsPath?: string): { ads: AdRow[]; tags: Tags } {
  const ads = importMetaCsv(readFileSync(csvPath, "utf8"));
  const tags = tagsPath ? parseTags(JSON.parse(readFileSync(tagsPath, "utf8"))) : {};
  return { ads, tags };
}
