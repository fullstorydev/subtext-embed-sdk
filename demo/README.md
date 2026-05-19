# Embed harness

Local end-to-end demo of `@subtextdev/subtext-embed`. The proxy serves the harness page, hosts a `POST /mint` endpoint (a stand-in for your backend's OAuth token mint), and proxies API / WebSocket calls to the Subtext app host.

## Setup

```bash
npm run build

export SUBTEXT_OAUTH_CLIENT_ID=...
export SUBTEXT_OAUTH_CLIENT_SECRET=...
```

For a local Fullstory stack:

```bash
export SUBTEXT_AUTH_BASE=https://auth.fullstory.test:8043
export UPSTREAM_HOST=app.fullstory.test
export UPSTREAM_PORT=8043
export ALLOW_INSECURE=1
```

## Run

```bash
node demo/proxy.mjs
# open http://localhost:9876
```

Paste a canonical trace URL — `https://app.fullstory.com/subtext/o-XXX/trace/tr-yyy`, or a path-only `/subtext/o-XXX/trace/tr-yyy` when going through the proxy. The status line shows "Embed ready" once the iframe mounts.

The harness sets `allowedParentOrigin` to `http://localhost:9876`. Because the proxy puts the iframe and harness on the same origin, this exercises `postMessage` same-origin only. To exercise the cross-origin path used in production, host the harness on a different port or domain while keeping the iframe on the app host.

## Alternative: mint a token without the harness

```bash
SUBTEXT_OAUTH_CLIENT_ID=... SUBTEXT_OAUTH_CLIENT_SECRET=... \
  node scripts/mint-token.mjs --trace-url "https://app.fullstory.com/subtext/o-XXX/trace/tr-yyy"
```

`--json` for `{ accessToken, expiresAt, embedUrl }`, `--dry-run` to print the OAuth body without calling the server.
