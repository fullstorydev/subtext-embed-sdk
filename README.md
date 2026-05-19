# @subtextdev/subtext-embed

Host SDK for embedding the Subtext trace viewer in your app. Renders the iframe, delivers an OAuth access token, and refreshes it automatically — you provide a `traceUrl` and a backend endpoint that mints tokens.

## Install

```
npm install @subtextdev/subtext-embed
```

See [`demo/`](https://github.com/fullstorydev/subtext-embed-sdk/tree/main/demo) on GitHub for an end-to-end example with a local token-mint server.

## Vanilla

```js
import { SubtextEmbed } from '@subtextdev/subtext-embed';

const handle = await SubtextEmbed.render({
  parentElement: '#replay-container',
  traceUrl: 'https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz12345',

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

Called with no arguments. Invoked once during `render()` and again on every token-refresh request from the iframe. Throwing rejects the request; the iframe reports `auth_failed` via `onError`.

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

The `audience` must match the trace being embedded. A wrong audience returns 403 on playback APIs.

Return `{ token: access_token, expiresAt }` to the browser (compute `expiresAt` from `expires_in`).

## Options

- **`allowedParentOrigin`** — defaults to `window.location.origin`. Override when the SDK runs on a different origin than the page that should receive postMessages.

## CSP

Embedders may need:

- `frame-src https://app.fullstory.com` (or your Fullstory app host)
- `connect-src` for your token-refresh backend

## Security

- Tokens are trace-scoped via `urn:fullstory:subtext:trace:<traceId>` audience and travel via URL fragment / `postMessage` — never in URLs that browsers log to history or send as `Referer`.
- Host and iframe pin `postMessage` origins on both sides; messages from other frames or origins are dropped.

## License

MIT.
