import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { bindGameFrameReply, isFromGameFrame } from './frameMessage.js';
import { useFrameDocument } from './frameLifecycle.js';
import { recordImageExportStep } from './visitTelemetry.js';

// Sandbox lacks allow-downloads; the player saves via a shell prompt.

export const IMAGE_EXPORT_PREFIX = 'data:image/png;base64,';
export const MAX_IMAGE_EXPORT_CHARS = 8_000_000;
export const IMAGE_EXPORT_INTERVAL_MS = 1500;
export const IMAGE_EXPORT_PROMPT_MS = 60_000;
// Save stays inert briefly; a game cannot time clicks onto it.
export const IMAGE_EXPORT_ARM_MS = 500;
const REVOKE_DELAY_MS = 1000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface ImageExportRequest {
  id: number;
  filename: string;
  bytes: Uint8Array<ArrayBuffer>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function sanitizeImageName(raw: unknown): string {
  const base = typeof raw === 'string' ? raw.toLowerCase().replace(/\.png$/, '') : '';
  const slug = base
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/, '');
  return `${slug || 'photo'}.png`;
}

function decodePng(data: string): Uint8Array<ArrayBuffer> | null {
  let binary: string;
  try {
    binary = atob(data.slice(IMAGE_EXPORT_PREFIX.length));
  } catch {
    return null;
  }
  if (binary.length < PNG_SIGNATURE.length) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte) ? bytes : null;
}

export function isImageExportMessage(raw: unknown): boolean {
  return isObject(raw) && raw.ns === BRIDGE_NAMESPACE && raw.v === PROTOCOL_VERSION && raw.t === 'image:export';
}

// The kit matches replies by this id; anything else is refused.
export function readImageExportId(raw: unknown): number | null {
  const id = isObject(raw) ? raw.id : undefined;
  return typeof id === 'number' && Number.isInteger(id) && id >= 0 ? id : null;
}

// Null unless a valid PNG under the size cap.
export function parseImageExportMessage(raw: unknown): ImageExportRequest | null {
  if (!isImageExportMessage(raw)) return null;
  const id = readImageExportId(raw);
  if (id === null) return null;
  const { data, name } = raw as Record<string, unknown>;
  if (typeof data !== 'string' || data.length > MAX_IMAGE_EXPORT_CHARS) return null;
  if (!data.startsWith(IMAGE_EXPORT_PREFIX)) return null;
  const bytes = decodePng(data);
  return bytes ? { id, filename: sanitizeImageName(name), bytes } : null;
}

function downloadPng({ filename, bytes }: ImageExportRequest): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
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

export interface ImageExportPrompt {
  filename: string;
  // Only ever called from the Save button's click handler.
  save: () => void;
  dismiss: () => void;
}

interface Pending {
  request: ImageExportRequest;
  finish: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function useImageExportBridge(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  enabled = true,
): ImageExportPrompt | null {
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
          downloadPng(current.request);
          ok = true;
        } catch {
          ok = false;
        }
      }
      current.finish(ok);
      recordImageExportStep(ok ? 'saved' : save ? 'failed' : 'dismissed');
    };
    settleRef.current = settle;

    function onMessage(event: MessageEvent) {
      if (!isFromGameFrame(event, frameRef.current)) return;
      if (!isImageExportMessage(event.data)) return;
      const reply = bindGameFrameReply(frameRef.current);
      const id = readImageExportId(event.data);
      const send = (payload: Record<string, unknown>) => {
        if (!cancelled)
          reply({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload, ...(id === null ? {} : { id }) });
      };
      const reject = () => {
        recordImageExportStep('rejected');
        send({ t: 'image:exported', ok: false });
      };
      if (pending) return reject();
      // Throttle before decoding so spam cannot burn shell CPU.
      const now = Date.now();
      if (now - lastRequestAt < IMAGE_EXPORT_INTERVAL_MS) return reject();
      lastRequestAt = now;
      const request = parseImageExportMessage(event.data);
      if (!request) return reject();
      pending = {
        request,
        finish: (ok) => send({ t: 'image:exported', ok }),
        timer: setTimeout(() => settle(false), IMAGE_EXPORT_PROMPT_MS),
      };
      setFilename(request.filename);
      send({ t: 'image:export-pending' });
      recordImageExportStep('requested');
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
  }, [frameRef, enabled, documentEpoch]);

  const save = useCallback(() => settleRef.current?.(true), []);
  const dismiss = useCallback(() => settleRef.current?.(false), []);
  return filename === null ? null : { filename, save, dismiss };
}
