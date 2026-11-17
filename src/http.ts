import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadData, rulesFromEnv } from "./config.js";
import { buildMcpServer, type DataLoader } from "./mcp.js";
import type { Rules } from "./types.js";

/**
 * Serves the MCP tools over HTTP at /mcp, for AI clients on your tailnet.
 *
 * Security model, same as the fulfilment dashboard:
 * - It listens on 127.0.0.1 only, so the one way in is Tailscale Serve on the same machine.
 * - Tailscale Serve adds a Tailscale-User-Login header saying who is calling. Only logins in
 *   OWNER_LOGINS are let through. Ad spend and revenue are business-sensitive, so there is no
 *   second role here.
 */
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 1_000_000;

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(text === "" ? undefined : JSON.parse(text));
      } catch {
        reject(new Error("Request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function createMcpHttpHandler(options: { load: DataLoader; rules: Rules; owners: string[] }) {
  const owners = new Set(options.owners.map((o) => o.trim().toLowerCase()).filter((o) => o !== ""));

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (path === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    if (path !== "/mcp") {
      sendJson(res, 404, { error: "Not found. The MCP endpoint is /mcp." });
      return;
    }

    const loginHeader = req.headers["tailscale-user-login"];
    const login = (Array.isArray(loginHeader) ? loginHeader[0] : loginHeader)?.trim().toLowerCase() ?? "";
    if (login === "") {
      sendJson(res, 401, { error: "Connect through Tailscale. This server is only available on the shop's tailnet." });
      return;
    }
    if (!owners.has(login)) {
      sendJson(res, 403, { error: `${login} is not allowed to read ad data.` });
      return;
    }

    if (req.method !== "POST") {
      // Stateless server: no long-lived streams or sessions to open or close.
      res.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
      return;
    }

    let body: unknown;
    try {
      body = await readBody(req);
    } catch (e) {
      sendJson(res, 400, { error: e instanceof Error ? e.message : "Bad request" });
      return;
    }

    // Stateless mode: a fresh server and transport for every request, so requests can't interfere.
    const server = buildMcpServer(options.load, options.rules);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };
}

function main() {
  const owners = (process.env.OWNER_LOGINS ?? "").split(",");
  if (owners.every((o) => o.trim() === "")) {
    console.error("Set OWNER_LOGINS to the Tailscale login(s) allowed to use this server. See .env.example.");
    process.exit(1);
  }
  const csvPath = process.env.ADS_CSV ?? "data/sample-meta-export.csv";
  const tagsPath = process.env.TAGS_FILE ?? "data/tags.example.json";
  const port = Number(process.env.PORT ?? 3200);

  const handle = createMcpHttpHandler({ load: () => loadData(csvPath, tagsPath), rules: rulesFromEnv(process.env), owners });
  createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) sendJson(res, 500, { error: "Internal error" });
      else res.end();
    });
  }).listen(port, HOST, () => {
    console.log(`MCP server on http://${HOST}:${port}/mcp, reading ${csvPath}`);
    console.log(`Share it on your tailnet with: tailscale serve --bg ${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
