import { useEffect, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { bindGameFrameReply, isFromGameFrame } from './frameMessage.js';

// Sandbox lacks allow-downloads, so the shell saves instead.

export const IMAGE_EXPORT_PREFIX = 'data:image/png;base64,';
export const MAX_IMAGE_EXPORT_CHARS = 8_000_000;
export const IMAGE_EXPORT_INTERVAL_MS = 1500;
const REVOKE_DELAY_MS = 1000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface ImageExportRequest {
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

// Null unless a valid PNG under the size cap.
export function parseImageExportMessage(raw: unknown): ImageExportRequest | null {
  if (!isImageExportMessage(raw)) return null;
  const { data, name } = raw as Record<string, unknown>;
  if (typeof data !== 'string' || data.length > MAX_IMAGE_EXPORT_CHARS) return null;
  if (!data.startsWith(IMAGE_EXPORT_PREFIX)) return null;
  const bytes = decodePng(data);
  return bytes ? { filename: sanitizeImageName(name), bytes } : null;
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

export function useImageExportBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let lastExportAt = -Infinity;

    function onMessage(event: MessageEvent) {
      if (!isFromGameFrame(event, frameRef.current)) return;
      if (!isImageExportMessage(event.data)) return;
      const reply = bindGameFrameReply(frameRef.current);
      const answer = (ok: boolean) => {
        if (!cancelled) reply({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'image:exported', ok });
      };
      // Throttle before decoding so spam cannot burn shell CPU.
      const now = Date.now();
      if (now - lastExportAt < IMAGE_EXPORT_INTERVAL_MS) return answer(false);
      lastExportAt = now;
      const request = parseImageExportMessage(event.data);
      if (!request) return answer(false);
      try {
        downloadPng(request);
      } catch {
        return answer(false);
      }
      answer(true);
    }

    window.addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
    };
  }, [frameRef, enabled]);
}
