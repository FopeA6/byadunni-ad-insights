import { parseCsv } from "./csv.js";
import type { AdRow, Tags } from "./types.js";

/**
 * Column names Meta Ads Manager uses in exports. They vary with the columns you pick and the
 * account's currency and language, so each field accepts a few names, matched without case.
 * "Amount spent" is matched as a prefix because the currency is part of the name, e.g. "Amount spent (GBP)".
 */
const COLUMNS: Record<keyof AdRow, { names: string[]; prefix?: boolean; required: boolean }> = {
  adName: { names: ["ad name"], required: true },
  spend: { names: ["amount spent"], prefix: true, required: true },
  impressions: { names: ["impressions"], required: false },
  clicks: { names: ["link clicks", "clicks (all)", "clicks"], required: false },
  addToCarts: { names: ["adds to cart", "website adds to cart", "add to cart"], required: false },
  purchases: { names: ["purchases", "website purchases"], required: false },
  revenue: { names: ["purchases conversion value", "website purchases conversion value", "purchase conversion value"], required: false },
};

function findColumn(headers: string[], spec: { names: string[]; prefix?: boolean }): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const name of spec.names) {
    const index = lower.findIndex((h) => (spec.prefix ? h.startsWith(name) : h === name));
    if (index !== -1) return index;
  }
  return -1;
}

/** "1,234.50", "£12", "" and "-" all become plain numbers (blank and "-" are 0). */
export function toNumber(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reads a Meta Ads export (one row per ad, or several rows per ad if broken down by day)
 * and returns one total per ad name.
 */
export function importMetaCsv(text: string): AdRow[] {
  const rows = parseCsv(text);
  const headers = rows[0];
  if (!headers) throw new Error("The CSV file is empty.");

  const index = {} as Record<keyof AdRow, number>;
  const missing: string[] = [];
  for (const [field, spec] of Object.entries(COLUMNS) as Array<[keyof AdRow, (typeof COLUMNS)[keyof AdRow]]>) {
    index[field] = findColumn(headers, spec);
    if (index[field] === -1 && spec.required) missing.push(spec.names[0]!);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing column(s): ${missing.join(", ")}. Columns found: ${headers.map((h) => `"${h.trim()}"`).join(", ")}.`,
    );
  }

  const byName = new Map<string, AdRow>();
  for (const cells of rows.slice(1)) {
    const adName = (cells[index.adName] ?? "").trim();
    if (adName === "") continue;
    const read = (field: keyof AdRow) => (index[field] === -1 ? 0 : toNumber(cells[index[field]]));
    const existing = byName.get(adName) ?? {
      adName,
      spend: 0,
      impressions: 0,
      clicks: 0,
      addToCarts: 0,
      purchases: 0,
      revenue: 0,
    };
    existing.spend += read("spend");
    existing.impressions += read("impressions");
    existing.clicks += read("clicks");
    existing.addToCarts += read("addToCarts");
    existing.purchases += read("purchases");
    existing.revenue += read("revenue");
    byName.set(adName, existing);
  }
  return [...byName.values()];
}

/** Checks a parsed tags file. Ad names are matched exactly, so copy them from the export. */
export function parseTags(raw: unknown): Tags {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error('Tags file must be a JSON object like { "Ad name": ["product-forward"] }.');
  }
  const tags: Tags = {};
  for (const [adName, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) {
      throw new Error(`Tags for "${adName}" must be a list of words.`);
    }
    tags[adName] = value.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag !== "");
  }
  return tags;
}
