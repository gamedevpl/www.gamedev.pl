import type { MutableRefObject } from 'react';
import {
  isFileExportMessage,
  readFileExportId,
  sanitizeFileName,
  useFileExportBridge,
  type FileExportKind,
  type FileExportPrompt,
  type FileExportRequest,
} from './fileExport.js';
import { recordVideoExportStep } from './visitTelemetry.js';

// Game-recorded clip; the shell only checks and saves bytes.

export const MAX_VIDEO_EXPORT_BYTES = 64 * 1024 * 1024;
const WEBM_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3];
// ISO BMFF: a box size, then `ftyp`.
const FTYP = [0x66, 0x74, 0x79, 0x70];

export type VideoExportRequest = FileExportRequest;

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  // Structured clone may come from another realm, so no instanceof.
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

// The container decides the extension and type, never the game's claim.
export function sniffVideo(bytes: Uint8Array): { extension: 'mp4' | 'webm'; mime: string } | null {
  if (bytes.length < 12) return null;
  if (FTYP.every((byte, i) => bytes[4 + i] === byte)) return { extension: 'mp4', mime: 'video/mp4' };
  if (WEBM_SIGNATURE.every((byte, i) => bytes[i] === byte)) return { extension: 'webm', mime: 'video/webm' };
  return null;
}

export function sanitizeVideoName(raw: unknown, extension: 'mp4' | 'webm'): string {
  const base = typeof raw === 'string' ? raw.replace(/\.(mp4|webm)$/i, '') : raw;
  return sanitizeFileName(base, extension, 'clip');
}

// Null unless an MP4 or WebM under the size cap.
export function parseVideoExportMessage(raw: unknown): VideoExportRequest | null {
  if (!isFileExportMessage(raw, 'video:export')) return null;
  const id = readFileExportId(raw);
  if (id === null) return null;
  const { data, name } = raw as Record<string, unknown>;
  if (!isArrayBuffer(data) || data.byteLength > MAX_VIDEO_EXPORT_BYTES) return null;
  const bytes = new Uint8Array(data);
  const format = sniffVideo(bytes);
  return format ? { id, filename: sanitizeVideoName(name, format.extension), mime: format.mime, bytes } : null;
}

const VIDEO_EXPORT: FileExportKind = {
  request: 'video:export',
  pending: 'video:export-pending',
  done: 'video:exported',
  parse: parseVideoExportMessage,
  record: recordVideoExportStep,
};

export function useVideoExportBridge(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  enabled = true,
): FileExportPrompt | null {
  return useFileExportBridge(frameRef, VIDEO_EXPORT, enabled);
}
