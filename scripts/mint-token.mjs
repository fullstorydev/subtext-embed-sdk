#!/usr/bin/env node
// Dev convenience: mint an OAuth embed token and print an embed URL.
//
// Production integrations must call POST https://auth.fullstory.com/oauth/token
// from the customer's backend (never from the browser). See embed/README.md.
//
// Usage:
//   SUBTEXT_OAUTH_CLIENT_ID=... SUBTEXT_OAUTH_CLIENT_SECRET=... \
//     node scripts/mint-token.mjs \
//     --trace-url "https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz"
//
//   SUBTEXT_AUTH_BASE=https://auth.fullstory.test:8043 node scripts/mint-token.mjs ...

import { parseArgs } from "node:util";

const EMBED_SCOPES = "playback:read users.metadata:read sessions:read";

const { values } = parseArgs({
  options: {
    "trace-url": { type: "string" },
    org: { type: "string" },
    "trace-id": { type: "string" },
    "auth-base": { type: "string" },
    "client-id": { type: "string" },
    "client-secret": { type: "string" },
    "allowed-parent-origin": { type: "string" },
    html: { type: "boolean" },
    json: { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Mint a Subtext embed OAuth token + URL (dev only).

Required (one of):
  --trace-url <url>            Canonical trace URL
  --org <id> --trace-id <id>   Org and trace IDs

Required credentials:
  --client-id / SUBTEXT_OAUTH_CLIENT_ID
  --client-secret / SUBTEXT_OAUTH_CLIENT_SECRET

Optional:
  --auth-base <url>            OAuth host (default: $SUBTEXT_AUTH_BASE or https://auth.fullstory.com)
  --allowed-parent-origin <o>  Parent origin for ?allowedParentOrigin= (default: http://localhost:9876)
  --html                       Print an <iframe> snippet
  --json                       Print { accessToken, expiresAt, embedUrl }
  --dry-run                    Print the token request body without calling the server
`);
  process.exit(0);
}

const clientId = values["client-id"] ?? process.env.SUBTEXT_OAUTH_CLIENT_ID;
const clientSecret = values["client-secret"] ?? process.env.SUBTEXT_OAUTH_CLIENT_SECRET;
if (!values["dry-run"] && (!clientId || !clientSecret)) {
  console.error("Error: --client-id/--client-secret or SUBTEXT_OAUTH_* env vars are required");
  process.exit(2);
}

const authBase = (
  values["auth-base"] ??
  process.env.SUBTEXT_AUTH_BASE ??
  "https://auth.fullstory.com"
).replace(/\/$/, "");

const allowedParentOrigin =
  values["allowed-parent-origin"] ??
  process.env.SUBTEXT_ALLOWED_PARENT_ORIGIN ??
  "http://localhost:9876";

let orgId;
let traceId;
let appHost;

if (values["trace-url"]) {
  const traceUrl = new URL(values["trace-url"]);
  appHost = `${traceUrl.protocol}//${traceUrl.host}`;
  const parts = traceUrl.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("trace");
  if (i < 1 || i >= parts.length - 1) {
    console.error("Error: --trace-url must look like .../subtext/:orgId/trace/:traceId");
    process.exit(2);
  }
  orgId = parts[i - 1];
  traceId = parts[i + 1];
} else if (values.org && values["trace-id"]) {
  orgId = values.org;
  traceId = values["trace-id"];
  appHost =
    process.env.SUBTEXT_APP_HOST ??
    authBase.replace(/(^|\/\/)auth\./, "$1app.");
} else {
  console.error("Error: provide --trace-url or both --org and --trace-id");
  process.exit(2);
}

if (!appHost) {
  appHost = authBase.replace(/(^|\/\/)auth\./, "$1app.");
}

const audience = `urn:fullstory:subtext:trace:${traceId}`;

const form = new URLSearchParams({
  grant_type: "client_credentials",
  client_id: clientId ?? "(dry-run)",
  client_secret: clientSecret ?? "(dry-run)",
  scope: EMBED_SCOPES,
  audience,
});

if (values["dry-run"]) {
  console.log(`POST ${authBase}/oauth/token`);
  console.log(
    [
      "grant_type=client_credentials",
      "client_id=<client_id>",
      "client_secret=<client_secret>",
      `scope=${EMBED_SCOPES}`,
      `audience=${audience}`,
    ].join("\n"),
  );
  process.exit(0);
}

const res = await fetch(`${authBase}/oauth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});

if (!res.ok) {
  console.error(`Error: HTTP ${res.status} from ${authBase}/oauth/token`);
  console.error(await res.text());
  process.exit(1);
}

const body = await res.json();
const accessToken = body.access_token;
if (!accessToken) {
  console.error("Error: response missing access_token");
  process.exit(1);
}

const expiresIn = Number(body.expires_in ?? 600);
const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

const embedParams = new URLSearchParams({
  embed: "true",
  allowedParentOrigin,
});
const embedUrl = `${appHost}/subtext/${orgId}/trace/${traceId}/embed?${embedParams.toString()}#token=${accessToken}`;

if (values.json) {
  console.log(JSON.stringify({ accessToken, expiresAt, embedUrl, audience }, null, 2));
} else if (values.html) {
  console.log(
    `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="600"\n  style="border: none; border-radius: 8px;"\n  allow="clipboard-write"\n  title="Subtext Session Replay"\n></iframe>`,
  );
} else {
  console.log(embedUrl);
}
