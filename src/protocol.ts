// postMessage protocol between the host page (this SDK) and the embedded
// Subtext iframe.

export interface TokenData {
  tokenType: 'Bearer';
  tokenString: string;
  // ISO 8601 timestamp. When supplied, the iframe proactively requests a
  // fresh token at expiresAt − 60s; when absent, the iframe only refreshes
  // reactively (on 401 or the next TOKEN_REQUEST).
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// iframe → host
// ---------------------------------------------------------------------------

export interface TokenRequest {
  name: 'ST_EMBED_TOKEN_REQUEST';
  reqId: string;
}

export interface ReadyEvent {
  name: 'ST_EMBED_READY_EVT';
}

export type EmbedErrorCode = 'auth_failed' | 'trace_not_found' | 'unknown';

export interface ErrorEvent {
  name: 'ST_EMBED_ERROR_EVT';
  code: EmbedErrorCode;
  message?: string;
}

export type EmbedMode = 'live' | 'review';

export interface ModeChanged {
  name: 'ST_EMBED_MODE_CHANGED';
  mode: EmbedMode;
}

export type EmbedFrameMessage = TokenRequest | ReadyEvent | ErrorEvent | ModeChanged;

// ---------------------------------------------------------------------------
// host → iframe
// ---------------------------------------------------------------------------

export interface TokenRespond {
  name: 'ST_EMBED_TOKEN_RESPOND';
  // Echoes back the reqId from TOKEN_REQUEST. Omitted for proactive pushes
  // (scheduled refresh without a matching request).
  reqId?: string;
  body: TokenData;
}

export type EmbedHostMessage = TokenRespond;

export const ST_EMBED_PREFIX = 'ST_EMBED_';
