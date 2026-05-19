// Tiny reverse proxy for the embed preview harness.
//
// Serves embed-harness.html at /, the built SDK at /sdk/, POST /mint for
// dev token refresh, and proxies everything else to the configured upstream
// Subtext app. Same-origin keeps the iframe and its API/WS on one hostname.
//
// Configure via env vars:
//   PORT                      default 9876
//   UPSTREAM_HOST             default app.fullstory.com
//   UPSTREAM_PORT             default 443
//   UPSTREAM_PROTO            http | https (default https)
//   ALLOW_INSECURE            1 to accept self-signed upstream certs
//   SUBTEXT_OAUTH_CLIENT_ID   OAuth client (for /mint)
//   SUBTEXT_OAUTH_CLIENT_SECRET
//   SUBTEXT_AUTH_BASE         default https://auth.fullstory.com
//
// Run:
//   cd embed && npm run build
//   SUBTEXT_OAUTH_CLIENT_ID=... SUBTEXT_OAUTH_CLIENT_SECRET=... \
//     SUBTEXT_AUTH_BASE=https://auth.fullstory.test:8043 \
//     UPSTREAM_HOST=app.fullstory.test UPSTREAM_PORT=8043 ALLOW_INSECURE=1 \
//     node demo/proxy.mjs

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_PATH = path.join(__dirname, "embed-harness.html");
const SDK_ROOT = path.join(__dirname, "..", "build", "src");

const EMBED_SCOPES = "playback:read users.metadata:read sessions:read";

const UPSTREAM_HOST = process.env.UPSTREAM_HOST ?? "app.fullstory.com";
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT ?? 443);
const UPSTREAM_PROTO = process.env.UPSTREAM_PROTO ?? "https";
const ALLOW_INSECURE = process.env.ALLOW_INSECURE === "1";
const LISTEN_PORT = Number(process.env.PORT ?? 9876);

const AUTH_BASE = (
  process.env.SUBTEXT_AUTH_BASE ?? "https://auth.fullstory.com"
).replace(/\/$/, "");

const harness = fs.readFileSync(HARNESS_PATH, "utf8");
const upstreamMod = UPSTREAM_PROTO === "http" ? http : https;
const upstreamHostHeader =
  (UPSTREAM_PROTO === "https" && UPSTREAM_PORT === 443) ||
  (UPSTREAM_PROTO === "http" && UPSTREAM_PORT === 80)
    ? UPSTREAM_HOST
    : `${UPSTREAM_HOST}:${UPSTREAM_PORT}`;

function parseTraceId(traceUrl) {
  const url = new URL(traceUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("trace");
  if (i < 1 || i >= parts.length - 1) {
    throw new Error("traceUrl must look like .../subtext/:orgId/trace/:traceId");
  }
  return parts[i + 1];
}

async function mintToken(traceUrl, allowedParentOrigin) {
  const clientId = process.env.SUBTEXT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUBTEXT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SUBTEXT_OAUTH_CLIENT_ID and SUBTEXT_OAUTH_CLIENT_SECRET are required for /mint");
  }

  const traceId = parseTraceId(traceUrl);
  const audience = `urn:fullstory:subtext:trace:${traceId}`;
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: EMBED_SCOPES,
    audience,
  });

  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`oauth/token ${res.status}: ${text}`);
  }
  const body = await res.json();
  const token = body.access_token;
  if (!token) throw new Error("oauth response missing access_token");
  const expiresIn = Number(body.expires_in ?? 600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { token, expiresAt, audience };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveSdkFile(url, res) {
  const rel = url.pathname.replace(/^\/sdk\/?/, "") || "index.js";
  const filePath = path.join(SDK_ROOT, rel);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(SDK_ROOT))) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(resolved);
  const type =
    ext === ".js"
      ? "text/javascript; charset=utf-8"
      : ext === ".ts"
        ? "text/typescript; charset=utf-8"
        : "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(fs.readFileSync(resolved));
}

function proxy(req, res) {
  const upstreamOpts = {
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: upstreamHostHeader },
    rejectUnauthorized: !ALLOW_INSECURE,
  };
  const up = upstreamMod.request(upstreamOpts, (upRes) => {
    res.writeHead(upRes.statusCode ?? 502, upRes.headers);
    upRes.pipe(res);
  });
  up.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`upstream error: ${err.message}`);
  });
  req.pipe(up);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${LISTEN_PORT}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }

  if (url.pathname.startsWith("/sdk/")) {
    serveSdkFile(url, res);
    return;
  }

  if (url.pathname === "/mint" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const { traceUrl } = JSON.parse(raw || "{}");
      if (!traceUrl) {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("traceUrl required");
        return;
      }
      const origin = req.headers.origin ?? `http://localhost:${LISTEN_PORT}`;
      const result = await mintToken(traceUrl, origin);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ token: result.token, expiresAt: result.expiresAt }));
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  proxy(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const up = upstreamMod.request({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: upstreamHostHeader },
    rejectUnauthorized: !ALLOW_INSECURE,
  });
  up.on("upgrade", (upRes, upSocket, upHead) => {
    socket.write(
      `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n` +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (upHead && upHead.length) socket.write(upHead);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });
  up.on("error", () => socket.destroy());
  up.end();
});

server.listen(LISTEN_PORT, () => {
  const upstreamUrl = `${UPSTREAM_PROTO}://${upstreamHostHeader}`;
  console.log(`embed-preview proxy listening on http://localhost:${LISTEN_PORT}`);
  console.log(`  /           → embed-harness.html (uses @subtextdev/subtext-embed)`);
  console.log(`  /sdk/*      → embed/build/src/*`);
  console.log(`  POST /mint  → OAuth token (dev backend stand-in)`);
  console.log(`  /*          → ${upstreamUrl}/*`);
  console.log(`  allowedParentOrigin for proxied harness: http://localhost:${LISTEN_PORT}`);
});
