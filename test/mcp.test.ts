import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, test } from "vitest";
import { loadData } from "../src/config.js";
import { createMcpHttpHandler } from "../src/http.js";
import { defaultRules } from "../src/types.js";

let server: Server | undefined;

async function start(load = () => loadData("data/sample-meta-export.csv", "data/tags.example.json")) {
  const handle = createMcpHttpHandler({ load, rules: defaultRules, owners: ["Owner@Example.com"] });
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function connectAs(base: string, login: string) {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { "Tailscale-User-Login": login } },
  });
  await client.connect(transport);
  return client;
}

function parse(result: unknown) {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  return JSON.parse(content[0]!.text);
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe("who can connect", () => {
  test("no Tailscale identity: 401", async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  test("a tailnet user who isn't an owner: 403", async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`, { method: "POST", body: "{}", headers: { "Tailscale-User-Login": "packer@example.com" } });
    expect(res.status).toBe(403);
  });

  test("unknown paths are 404 and the health check is open", async () => {
    const base = await start();
    expect((await fetch(`${base}/other`)).status).toBe(404);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });
});

describe("tools, through a real MCP client", () => {
  test("lists the three tools", async () => {
    const client = await connectAs(await start(), "owner@example.com");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["ad_calls", "ad_details", "compare_creative_types"]);
    await client.close();
  });

  test("ad_calls can filter to the ads to pause", async () => {
    const client = await connectAs(await start(), "owner@example.com");
    const body = parse(await client.callTool({ name: "ad_calls", arguments: { verdict: "pause" } }));
    expect(body.calls.map((c: { adName: string }) => c.adName)).toEqual(["Unboxing – trend audio", "Beading process – studio"]);
    await client.close();
  });

  test("compare_creative_types puts the cheapest type first", async () => {
    const client = await connectAs(await start(), "owner@example.com");
    const body = parse(await client.callTool({ name: "compare_creative_types", arguments: {} }));
    expect(body.types[0].tag).toBe("product-forward");
    expect(body.types[0].metrics.costPerPurchase).toBe(27.53);
    await client.close();
  });

  test("ad_details finds an ad by name, ignoring case, and errors clearly when it can't", async () => {
    const client = await connectAs(await start(), "owner@example.com");
    const found = parse(await client.callTool({ name: "ad_details", arguments: { adName: "coffee bag – product close-up" } }));
    expect(found.verdict).toBe("keep");
    const missing = await client.callTool({ name: "ad_details", arguments: { adName: "Nope" } });
    expect(missing.isError).toBe(true);
    await client.close();
  });

  test("a broken export becomes a tool error, not a crash", async () => {
    const base = await start(() => {
      throw new Error("Missing column(s): ad name");
    });
    const client = await connectAs(base, "owner@example.com");
    const result = await client.callTool({ name: "ad_calls", arguments: {} });
    expect(result.isError).toBe(true);
    expect(parse(result).error).toContain("Missing column(s)");
    await client.close();
  });
});
