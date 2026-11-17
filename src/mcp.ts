import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callAds, compareCreativeTypes } from "./analysis.js";
import type { AdRow, Rules, Tags } from "./types.js";

export type DataLoader = () => { ads: AdRow[]; tags: Tags };

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function error(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

/**
 * Three read-only tools over the latest Meta Ads export. Each call reloads the data, so a
 * fresh export is picked up straight away. Nothing here can change the ad account.
 */
export function buildMcpServer(load: DataLoader, rules: Rules): McpServer {
  const server = new McpServer({ name: "adunni-ad-insights", version: "1.0.0" });

  const safely = <T>(fn: () => T) => {
    try {
      return json(fn());
    } catch (e) {
      return error(`Could not read the ads data: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  server.registerTool(
    "ad_calls",
    {
      title: "Keep, pause, watch or wait for each ad",
      description:
        "Returns a call for every ad in the latest Meta Ads export: 'pause' (act today), 'keep', " +
        "'watch' (cost per purchase above target) or 'wait' (too early to judge), each with a plain-English " +
        `reason and its numbers. The target cost per purchase is ${rules.currency}${rules.targetCostPerPurchase}. ` +
        "Optionally filter to one verdict.",
      inputSchema: {
        verdict: z.enum(["keep", "watch", "pause", "wait"]).optional().describe("Only return ads with this call."),
      },
    },
    async ({ verdict }) =>
      safely(() => {
        const { ads, tags } = load();
        const calls = callAds(ads, tags, rules);
        return { rules, calls: verdict ? calls.filter((c) => c.verdict === verdict) : calls };
      }),
  );

  server.registerTool(
    "compare_creative_types",
    {
      title: "Compare creative types",
      description:
        "Totals for each creative type (for example product-forward, styling, behind-the-scenes), sorted by " +
        "cost per purchase. Each includes purchases per 100 clicks with a 95% range. 'overlapsBest: true' means " +
        "the gap to the best type could be chance; say so rather than declaring a winner.",
      inputSchema: {},
    },
    async () =>
      safely(() => {
        const { ads, tags } = load();
        return { types: compareCreativeTypes(ads, tags) };
      }),
  );

  server.registerTool(
    "ad_details",
    {
      title: "One ad's numbers",
      description: "Full numbers and the call for one ad, by its exact name as it appears in Ads Manager.",
      inputSchema: { adName: z.string().describe("The ad's exact name.") },
    },
    async ({ adName }) => {
      let result;
      try {
        const { ads, tags } = load();
        result = callAds(ads, tags, rules).find((c) => c.adName.toLowerCase() === adName.trim().toLowerCase());
      } catch (e) {
        return error(`Could not read the ads data: ${e instanceof Error ? e.message : String(e)}`);
      }
      return result ? json(result) : error(`No ad named "${adName}" in the latest export.`);
    },
  );

  return server;
}
