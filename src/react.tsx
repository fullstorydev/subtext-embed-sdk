// React entry — thin wrapper around the vanilla SDK.
//
// Usage:
//   import { SubtextEmbed } from '@subtextdev/subtext-embed/react';
//
//   <SubtextEmbed
//     traceUrl="https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz"
//     refreshAuthToken={async () => ({ token, expiresAt })}
//     onReady={() => {}}
//     width="100%"
//     height={675}
//   />

import * as React from 'react';
import { render as renderEmbed, type SubtextEmbedHandle } from './embed.js';
import type { RefreshAuthTokenFunc } from './channel.js';
import type { EmbedMode, EmbedErrorCode } from './protocol.js';

function toCssSize(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

export interface SubtextEmbedProps {
  traceUrl: string;
  refreshAuthToken: RefreshAuthTokenFunc;
  /** Defaults to window.location.origin. */
  allowedParentOrigin?: string;
  onReady?: () => void;
  onError?: (err: { code: EmbedErrorCode; message?: string }) => void;
  onModeChanged?: (mode: EmbedMode) => void;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const SubtextEmbed: React.FC<SubtextEmbedProps> = props => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Callbacks are stable per-mount via refs so re-renders of the parent
  // don't tear down and re-create the iframe (which would interrupt
  // playback and re-fire READY).
  const callbacksRef = React.useRef({
    refreshAuthToken: props.refreshAuthToken,
    allowedParentOrigin: props.allowedParentOrigin,
    onReady: props.onReady,
    onError: props.onError,
    onModeChanged: props.onModeChanged,
  });
  React.useEffect(() => {
    callbacksRef.current = {
      refreshAuthToken: props.refreshAuthToken,
      allowedParentOrigin: props.allowedParentOrigin,
      onReady: props.onReady,
      onError: props.onError,
      onModeChanged: props.onModeChanged,
    };
  });

  React.useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    let handle: SubtextEmbedHandle | null = null;
    let cancelled = false;

    (async () => {
      try {
        const h = await renderEmbed({
          parentElement: parent,
          traceUrl: props.traceUrl,
          allowedParentOrigin: callbacksRef.current.allowedParentOrigin,
          // Delegate through the ref so the iframe sees the latest caller
          // while surviving parent re-renders.
          refreshAuthToken: () => callbacksRef.current.refreshAuthToken(),
          onReady: () => callbacksRef.current.onReady?.(),
          onError: err => callbacksRef.current.onError?.(err),
          onModeChanged: mode => callbacksRef.current.onModeChanged?.(mode),
          width: props.width,
          height: props.height,
        });
        if (cancelled) {
          h.destroy();
          return;
        }
        handle = h;
      } catch (err) {
        callbacksRef.current.onError?.({
          code: 'unknown',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
      handle?.destroy();
    };
    // Re-mount iframe iff the trace target itself changes. Size changes
    // are applied via inline style without tearing down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.traceUrl, props.allowedParentOrigin]);

  const widthCss = props.width !== undefined ? toCssSize(props.width) : undefined;
  const heightCss = props.height !== undefined ? toCssSize(props.height) : undefined;

  React.useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const iframe = parent.querySelector('iframe');
    if (!iframe) return;
    if (widthCss !== undefined) iframe.style.width = widthCss;
    if (heightCss !== undefined) iframe.style.height = heightCss;
  }, [widthCss, heightCss]);

  const containerStyle: React.CSSProperties = {
    display: 'block',
    width: widthCss,
    height: heightCss,
    ...props.style,
  };

  return <div ref={containerRef} className={props.className} style={containerStyle} />;
};
