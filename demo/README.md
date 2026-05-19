# Embed harness

End-to-end test harness for the `@subtextdev/subtext-embed` host SDK. Uses the
SDK's `SubtextEmbed.render()` with `refreshAuthToken` calling `POST /mint` on
the local proxy (a stand-in for your backend → `https://auth.fullstory.com/oauth/token`).

## Files

- `embed-harness.html` — Mock "agent chat" page; loads the built SDK from `/sdk/`.
- `proxy.mjs` — Serves the harness, SDK bundle, `/mint`, and proxies app routes upstream.
- `../scripts/mint-token.mjs` — CLI to mint a token and print an embed URL (no harness).

## Prerequisites

```bash
cd embed && npm run build
```

Set OAuth credentials (from Fullstory for the pilot customer):

```bash
export SUBTEXT_OAUTH_CLIENT_ID=...
export SUBTEXT_OAUTH_CLIENT_SECRET=...
```

By default the proxy mints against `https://auth.fullstory.com` and proxies to
`https://app.fullstory.com`. For a local Fullstory stack:

```bash
export SUBTEXT_AUTH_BASE=https://auth.fullstory.test:8043
export UPSTREAM_HOST=app.fullstory.test
export UPSTREAM_PORT=8043
export ALLOW_INSECURE=1
```

## Run the harness (proxied)

```bash
node demo/proxy.mjs
# open http://localhost:9876
```

Paste a canonical trace URL, e.g.
`https://app.fullstory.com/subtext/o-XXX/trace/tr-yyyyyy`
(or a path-only `/subtext/o-XXX/trace/tr-yyyyyy` when using the proxy).

The harness sets `allowedParentOrigin` to `http://localhost:9876`. With the proxy,
the iframe and harness share that origin — unlike production cross-origin embeds.
To exercise true cross-origin postMessage, host the harness on a different port or
domain while keeping the iframe on the app host.

## CLI mint (without harness)

```bash
SUBTEXT_OAUTH_CLIENT_ID=... SUBTEXT_OAUTH_CLIENT_SECRET=... \
  node scripts/mint-token.mjs --trace-url "https://app.fullstory.com/subtext/o-XXX/trace/tr-yyy"
```

Use `--json` for `{ accessToken, expiresAt, embedUrl }`, or `--dry-run` to print
the OAuth form body without calling the server.

## What to verify in DevTools

On the harness page (host context):

- Status line shows "Embed ready" after load.
- After ~540s (600s token − 60s lead), status should still be healthy (refresh via `/mint`).

In the iframe context:

- **Network** — `GET https://api.fullstory.com/playback/v1/trace?trace_id=<TR>` with `Authorization: Bearer …`.
- **Console** — no `missing or invalid allowedParentOrigin` errors.
- **Live mode** — WebSocket to `/subtext/live/stream?connection_id=…&token=…` when the trace is live.

## Token TTL

OAuth access tokens are 600 seconds (10 minutes). The iframe requests a refresh
at `expiresAt − 60s` when `refreshAuthToken` returns `{ token, expiresAt }`.
