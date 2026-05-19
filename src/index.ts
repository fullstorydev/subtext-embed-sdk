// Vanilla / framework-agnostic entry.
//
// Usage:
//   import { SubtextEmbed } from '@subtextdev/subtext-embed';
//
//   const handle = await SubtextEmbed.render({
//     parentElement: '#replay',
//     traceUrl: 'https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz',
//     refreshAuthToken: async () => {
//       const res = await fetch('/api/subtext/embed/refresh', { method: 'POST' });
//       return res.json(); // { token, expiresAt }
//     },
//   });
//   // ...
//   handle.destroy();
//
// Your backend must mint OAuth tokens via POST https://auth.fullstory.com/oauth/token
// (client_credentials) with audience=urn:fullstory:subtext:trace:<traceId>.
// Never expose client_id / client_secret in the browser.

export { render, SubtextEmbed } from './embed.js';
export type { SubtextEmbedOptions, SubtextEmbedHandle } from './embed.js';
export type { RefreshAuthTokenFunc } from './channel.js';
export type {
  EmbedMode,
  EmbedErrorCode,
  TokenData,
} from './protocol.js';
export { parseTraceUrl, buildEmbedSrc, InvalidTraceUrlError } from './url.js';
export type { TraceUrlParts, BuildEmbedSrcOptions } from './url.js';
