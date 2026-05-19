# @subtextdev/subtext-embed

Host SDK for embedding the Subtext trace viewer in a third-party page. Renders the iframe, delivers an initial OAuth access token via the URL fragment, and refreshes tokens via `postMessage` so viewing sessions survive past the token TTL (600 seconds by default).

The iframe-side counterpart lives in `packages/subtext-replay-ui/src/embed/` in the Fullstory monorepo.

## Install

```
npm install @subtextdev/subtext-embed
```

## Try it out

A standalone end-to-end harness lives in [`demo/`](./demo/). It uses the host SDK against a local proxy and `scripts/mint-token.mjs` for dev token minting.

## Token minting (your backend)

The browser must **never** hold your OAuth `client_id` / `client_secret`. Implement a backend endpoint your page calls from `refreshAuthToken`; that endpoint calls Fullstory's token URL:

```
POST https://auth.fullstory.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=…
&client_secret=…
&scope=playback:read users.metadata:read sessions:read
&audience=urn:fullstory:subtext:trace:<traceId>
```

The `audience` must match the trace being embedded. Wrong audience returns 403 on playback APIs.

Return `{ token: access_token, expiresAt }` to the browser (compute `expiresAt` from `expires_in`).

For local dev, see `scripts/mint-token.mjs` and `demo/README.md`.

## Vanilla

```js
import { SubtextEmbed } from '@subtextdev/subtext-embed';

const handle = await SubtextEmbed.render({
  parentElement: '#replay-container',
  traceUrl: 'https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz12345',

  // Called once on mount and again each time the iframe asks for a
  // fresh token (before expiry, or after a 401). Calls your backend,
  // which proxies to auth.fullstory.com/oauth/token.
  refreshAuthToken: async () => {
    const res = await fetch('/api/subtext/embed/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ traceId: 'tr-xyz12345' }),
    });
    const { token, expiresAt } = await res.json();
    return { token, expiresAt };
  },

  onReady: () => console.log('embed ready'),
  onError: ({ code, message }) => console.error(code, message),
  onModeChanged: mode => console.log('mode:', mode), // 'live' | 'review'

  width: '100%',
  height: 675,
});

// Later:
handle.destroy();
```

`allowedParentOrigin` defaults to `window.location.origin`. Override when the SDK runs on a different origin than the page that should receive postMessages.

## React

```jsx
import { SubtextEmbed } from '@subtextdev/subtext-embed/react';

export function TracePanel({ traceUrl }) {
  return (
    <SubtextEmbed
      traceUrl={traceUrl}
      refreshAuthToken={async () => {
        const res = await fetch('/api/subtext/embed/refresh', { method: 'POST' });
        return res.json(); // { token, expiresAt }
      }}
      onReady={() => {}}
      onError={err => console.error(err)}
      width="100%"
      height={675}
    />
  );
}
```

## `refreshAuthToken` contract

Return either:

- A bare string — the Bearer token. The iframe only re-requests on 401 / scheduled refresh.
- `{ token, expiresAt }` — same Bearer, plus an ISO 8601 expiry. The iframe proactively requests a fresh token at `expiresAt − 60s`.

The function is called with no arguments. It's invoked:

1. Once during `render()` — the initial token is injected into the iframe URL fragment.
2. Again on every `ST_EMBED_TOKEN_REQUEST` message from the iframe.

Throwing rejects the request; the iframe reports `auth_failed` via `onError`.

## `postMessage` protocol

Messages use the `ST_EMBED_` prefix. Origin checks on both sides validate that sender/receiver match the app origin (host) or the parent origin declared via `?allowedParentOrigin=` (iframe). Unknown `ST_EMBED_*` message names are ignored.

| Direction        | Name                         | Payload                                                      |
| ---------------- | ---------------------------- | ------------------------------------------------------------ |
| iframe → host    | `ST_EMBED_TOKEN_REQUEST`     | `{ reqId }`                                                  |
| host → iframe    | `ST_EMBED_TOKEN_RESPOND`     | `{ reqId?, body: { tokenType, tokenString, expiresAt? } }`   |
| iframe → host    | `ST_EMBED_READY_EVT`         | _none_                                                       |
| iframe → host    | `ST_EMBED_ERROR_EVT`         | `{ code, message? }`                                         |
| iframe → host    | `ST_EMBED_MODE_CHANGED`      | `{ mode: 'live' \| 'review' }`                               |

## Security

- Tokens travel via URL fragment and `postMessage`, never query params on navigation (except the live WebSocket, which passes `?token=` at connect time only).
- Host SDK filters inbound messages by `event.source === iframe.contentWindow` and `event.origin === appHost`.
- Iframe pins postMessage to `allowedParentOrigin` from the embed URL.
- OAuth tokens are trace-scoped via `urn:fullstory:subtext:trace:<traceId>` audience.

### CSP

Embedders may need:

- `frame-src https://app.fullstory.com` (or your Fullstory app host)
- `connect-src` for your token-refresh backend

## Live mode

The live viewer WebSocket (`/subtext/live/stream`) authenticates with `?token=` at connect time. Token rotation via postMessage does not re-auth an open WebSocket; on reconnect the iframe uses the latest token from the host SDK.

## License

MIT.
