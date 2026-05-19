// Parses the canonical Subtext trace URL:
//   https://app.fullstory.com/subtext/:orgId/trace/:traceId
// Returns the components the SDK needs to construct the embed iframe src.

export interface TraceUrlParts {
  appHost: string; // e.g. https://app.fullstory.com
  orgId: string;
  traceId: string;
}

export interface BuildEmbedSrcOptions {
  initialToken: string | null;
  // Exact parent origin (e.g. https://customer.example). Required by the
  // iframe's useEmbedAuth — without it the embed shell refuses to start.
  allowedParentOrigin: string;
}

export class InvalidTraceUrlError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid trace URL "${input}": ${reason}`);
    this.name = 'InvalidTraceUrlError';
  }
}

export function parseTraceUrl(raw: string): TraceUrlParts {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidTraceUrlError(raw, 'not a valid absolute URL');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const traceIdx = parts.indexOf('trace');
  if (traceIdx < 1 || traceIdx >= parts.length - 1) {
    throw new InvalidTraceUrlError(
      raw,
      'expected path of the form /subtext/:orgId/trace/:traceId',
    );
  }
  const orgId = parts[traceIdx - 1]!;
  const traceId = parts[traceIdx + 1]!;
  // app.X → app host. Strip pathname/search/hash.
  const appHost = `${url.protocol}//${url.host}`;
  return { appHost, orgId, traceId };
}

// Build the iframe src for the embed route. The initial token, when
// provided, rides the URL fragment (never sent to the server, not in
// Referer, not in logs). Subsequent refreshes come via postMessage.
export function buildEmbedSrc(parts: TraceUrlParts, options: BuildEmbedSrcOptions): string {
  const { appHost, orgId, traceId } = parts;
  const params = new URLSearchParams({
    allowedParentOrigin: options.allowedParentOrigin,
  });
  const base = `${appHost}/subtext/${encodeURIComponent(orgId)}/trace/${encodeURIComponent(traceId)}/embed?${params.toString()}`;
  const token = options.initialToken;
  if (!token) return base;
  // The token is base64ish (may contain `+`, `/`, `:`, `!`). Don't
  // URL-encode: the iframe parses the fragment raw and treats `+` as
  // literal plus. See useEmbedAuth.parseTokenFromFragment in mn.
  return `${base}#token=${token}`;
}
