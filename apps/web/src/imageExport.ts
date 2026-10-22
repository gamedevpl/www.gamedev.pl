import type { MutableRefObject } from 'react';
import {
  FILE_EXPORT_ARM_MS,
  FILE_EXPORT_INTERVAL_MS,
  FILE_EXPORT_PROMPT_MS,
  isFileExportMessage,
  readFileExportId,
  sanitizeFileName,
  useFileExportBridge,
  type FileExportKind,
  type FileExportPrompt,
  type FileExportRequest,
} from './fileExport.js';
import { recordImageExportStep } from './visitTelemetry.js';

// Sandbox lacks allow-downloads; the player saves via a shell prompt.

export const IMAGE_EXPORT_PREFIX = 'data:image/png;base64,';
export const MAX_IMAGE_EXPORT_CHARS = 8_000_000;
export const IMAGE_EXPORT_INTERVAL_MS = FILE_EXPORT_INTERVAL_MS;
export const IMAGE_EXPORT_PROMPT_MS = FILE_EXPORT_PROMPT_MS;
export const IMAGE_EXPORT_ARM_MS = FILE_EXPORT_ARM_MS;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageExportRequest = FileExportRequest;
export type ImageExportPrompt = FileExportPrompt;

export function sanitizeImageName(raw: unknown): string {
  return sanitizeFileName(raw, 'png', 'photo');
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
  return isFileExportMessage(raw, 'image:export');
}

export const readImageExportId = readFileExportId;

// Null unless a valid PNG under the size cap.
export function parseImageExportMessage(raw: unknown): ImageExportRequest | null {
  if (!isImageExportMessage(raw)) return null;
  const id = readImageExportId(raw);
  if (id === null) return null;
  const { data, name } = raw as Record<string, unknown>;
  if (typeof data !== 'string' || data.length > MAX_IMAGE_EXPORT_CHARS) return null;
  if (!data.startsWith(IMAGE_EXPORT_PREFIX)) return null;
  const bytes = decodePng(data);
  return bytes ? { id, filename: sanitizeImageName(name), mime: 'image/png', bytes } : null;
}

const IMAGE_EXPORT: FileExportKind = {
  request: 'image:export',
  pending: 'image:export-pending',
  done: 'image:exported',
  parse: parseImageExportMessage,
  record: recordImageExportStep,
};

export function useImageExportBridge(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  enabled = true,
): ImageExportPrompt | null {
  return useFileExportBridge(frameRef, IMAGE_EXPORT, enabled);
}
