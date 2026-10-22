import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { bindGameFrameReply, isFromGameFrame } from './frameMessage.js';
import { useFrameDocument } from './frameLifecycle.js';

// Game asks; the player saves from a shell prompt.

export const FILE_EXPORT_INTERVAL_MS = 1500;
export const FILE_EXPORT_PROMPT_MS = 60_000;
// Save stays inert briefly; a game cannot time clicks onto it.
export const FILE_EXPORT_ARM_MS = 500;
const REVOKE_DELAY_MS = 1000;

export type FileExportStep = 'requested' | 'saved' | 'dismissed' | 'failed' | 'rejected';

export interface FileExportRequest {
  id: number;
  filename: string;
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export interface FileExportKind {
  // Message types: request, then pending and done replies.
  request: string;
  pending: string;
  done: string;
  // Null unless a valid file under the size cap.
  parse(raw: unknown): FileExportRequest | null;
  record(step: FileExportStep): void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isFileExportMessage(raw: unknown, type: string): boolean {
  return isObject(raw) && raw.ns === BRIDGE_NAMESPACE && raw.v === PROTOCOL_VERSION && raw.t === type;
}

// The kit matches replies by this id; anything else is refused.
export function readFileExportId(raw: unknown): number | null {
  const id = isObject(raw) ? raw.id : undefined;
  return typeof id === 'number' && Number.isInteger(id) && id >= 0 ? id : null;
}

// Lowercase slug, 48 chars max; fallback and extension forced.
export function sanitizeFileName(raw: unknown, extension: string, fallback: string): string {
  const base = typeof raw === 'string' ? raw.toLowerCase().replace(new RegExp(`\\.${extension}$`), '') : '';
  const slug = base
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/, '');
  return `${slug || fallback}.${extension}`;
}

function downloadFile({ filename, mime, bytes }: FileExportRequest): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

export interface FileExportPrompt {
  filename: string;
  // Only ever called from the Save button's click handler.
  save: () => void;
  dismiss: () => void;
}

interface Pending {
  request: FileExportRequest;
  finish: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function useFileExportBridge(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  kind: FileExportKind,
  enabled = true,
): FileExportPrompt | null {
  const [filename, setFilename] = useState<string | null>(null);
  const settleRef = useRef<((save: boolean) => void) | null>(null);
  const documentEpoch = useFrameDocument(frameRef);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let lastRequestAt = -Infinity;
    let pending: Pending | null = null;

    const settle = (save: boolean) => {
      const current = pending;
      if (!current) return;
      pending = null;
      clearTimeout(current.timer);
      setFilename(null);
      let ok = false;
      if (save) {
        try {
          downloadFile(current.request);
          ok = true;
        } catch {
          ok = false;
        }
      }
      current.finish(ok);
      kind.record(ok ? 'saved' : save ? 'failed' : 'dismissed');
    };
    settleRef.current = settle;

    function onMessage(event: MessageEvent) {
      if (!isFromGameFrame(event, frameRef.current)) return;
      if (!isFileExportMessage(event.data, kind.request)) return;
      const reply = bindGameFrameReply(frameRef.current);
      const id = readFileExportId(event.data);
      const send = (payload: Record<string, unknown>) => {
        if (!cancelled)
          reply({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload, ...(id === null ? {} : { id }) });
      };
      const reject = () => {
        kind.record('rejected');
        send({ t: kind.done, ok: false });
      };
      if (pending) return reject();
      // Throttle before decoding so spam cannot burn shell CPU.
      const now = Date.now();
      if (now - lastRequestAt < FILE_EXPORT_INTERVAL_MS) return reject();
      lastRequestAt = now;
      const request = kind.parse(event.data);
      if (!request) return reject();
      pending = {
        request,
        finish: (ok) => send({ t: kind.done, ok }),
        timer: setTimeout(() => settle(false), FILE_EXPORT_PROMPT_MS),
      };
      setFilename(request.filename);
      send({ t: kind.pending });
      kind.record('requested');
    }

    window.addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      if (pending) clearTimeout(pending.timer);
      pending = null;
      settleRef.current = null;
      setFilename(null);
    };
  }, [frameRef, kind, enabled, documentEpoch]);

  const save = useCallback(() => settleRef.current?.(true), []);
  const dismiss = useCallback(() => settleRef.current?.(false), []);
  return filename === null ? null : { filename, save, dismiss };
}
