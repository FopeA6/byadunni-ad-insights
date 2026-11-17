import type { AdCall, Range, Rules, TagSummary } from "./types.js";

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

const range = (r: Range | null) => (r ? `${r.low}–${r.high}%` : "–");

/** A plain-text report: what to do today, then which creative types are working. */
export function formatReport(calls: AdCall[], types: TagSummary[], rules: Rules): string {
  const money = (v: number | null) => (v === null ? "–" : `${rules.currency}${v.toFixed(2)}`);
  const out: string[] = [];

  out.push(`Ad calls (target ${money(rules.targetCostPerPurchase)} per purchase)`, "");
  for (const call of calls) {
    out.push(`${call.verdict.toUpperCase().padEnd(5)}  ${call.adName}  [${call.tags.join(", ")}]`);
    out.push(`       ${call.reason}`);
  }

  out.push("", "Creative types (cheapest cost per purchase first)", "");
  out.push(
    table(
      ["Type", "Ads", "Spend", "Purchases", "Cost/purchase", "ROAS", "Purchases per 100 clicks (95% range)"],
      types.map((t) => [
        t.tag,
        String(t.ads),
        money(t.metrics.spend),
        String(t.metrics.purchases),
        money(t.metrics.costPerPurchase),
        t.metrics.roas === null ? "–" : `${t.metrics.roas.toFixed(2)}x`,
        t.metrics.purchaseRate === null ? "–" : `${t.metrics.purchaseRate}% (${range(t.metrics.purchaseRateRange)})`,
      ]),
    ),
  );

  const clearlyBehind = types.filter((t) => t.overlapsBest === false).map((t) => t.tag);
  out.push("");
  out.push(
    clearlyBehind.length > 0
      ? `Clearly behind the best type, not just chance: ${clearlyBehind.join(", ")}.`
      : "Every type's range overlaps the best one's, so the differences could still be chance. Keep testing before cutting a whole type.",
  );
  return out.join("\n");
}
