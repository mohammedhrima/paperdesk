import { useEffect, useRef } from 'react';

/**
 * The bridge between a webview and the extension host.
 *
 * `acquireVsCodeApi` may only be called once per webview, so it is wrapped
 * here and nowhere else. The wrapper is generic over the message types a
 * surface sends and receives, which keeps each app honest about its protocol.
 */

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi = acquireVsCodeApi();

export function postToHost<Outgoing>(message: Outgoing): void {
  api.postMessage(message);
}

/**
 * Subscribes to messages from the host for the lifetime of the component. The
 * latest handler is always used, so callers need not memoize it.
 */
export function useHostMessages<Incoming extends { type: string }>(
  handler: (message: Incoming) => void,
): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent<Incoming>) => latest.current(event.data);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
}

/**
 * Small per-webview UI memory — collapsed branches, a remembered zoom — that
 * survives the view being hidden and reloaded. Nothing here is user data; that
 * always lives on disk.
 */
export function readViewState<T extends object>(fallback: T): T {
  const stored = api.getState();
  return stored && typeof stored === 'object' ? { ...fallback, ...(stored as Partial<T>) } : fallback;
}

export function writeViewState<T extends object>(state: T): void {
  api.setState(state);
}
