import { callAds, compareCreativeTypes } from "./analysis.js";
import { loadData, rulesFromEnv } from "./config.js";
import { formatReport } from "./report.js";

// Usage: npm run report -- <export.csv> [tags.json] [--json]
const args = process.argv.slice(2);
const json = args.includes("--json");
const [csvPath = process.env.ADS_CSV ?? "data/sample-meta-export.csv", tagsPath = process.env.TAGS_FILE ?? "data/tags.example.json"] =
  args.filter((a) => !a.startsWith("--"));

try {
  const rules = rulesFromEnv(process.env);
  const { ads, tags } = loadData(csvPath, tagsPath);
  const calls = callAds(ads, tags, rules);
  const types = compareCreativeTypes(ads, tags);
  console.log(json ? JSON.stringify({ rules, calls, types }, null, 2) : formatReport(calls, types, rules));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
