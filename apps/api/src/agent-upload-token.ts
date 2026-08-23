import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { InvalidAgentTokenError, STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import { DEFAULT_SIGNED_URL_TTL_SECONDS } from './delivery/gcs-sign.js';

// Short-lived PUT URLs for curl --upload-file.

const SCOPE = 'agent-upload-v1';

// Match kit signed-read TTL (15 min).
export const DEFAULT_UPLOAD_URL_TTL_SECONDS = DEFAULT_SIGNED_URL_TTL_SECONDS;

export type UploadKind = 'screenshot' | 'stage';

export interface UploadTokenClaims {
  jobId: number;
  roundGeneration: number;
  kind: UploadKind;
  // Stage path bound into the signature.
  path?: string;
  // Optional caption bound into the URL.
  label?: string;
  // Unix seconds.
  exp: number;
  nonce: string;
}

export interface MintUploadTokenOptions {
  jobId: number;
  roundGeneration: number;
  kind: UploadKind;
  path?: string;
  label?: string;
  // Epoch ms; defaults to Date.now().
  now?: number;
  // Override TTL seconds (tests).
  ttlSeconds?: number;
}

function encodeOptional(value: string | undefined): string {
  return value ? Buffer.from(value, 'utf8').toString('base64url') : '';
}

function decodeOptional(raw: string): string | undefined {
  if (!raw) return undefined;
  return Buffer.from(raw, 'base64url').toString('utf8');
}

function sign(
  jobId: number,
  roundGeneration: number,
  kind: UploadKind,
  path: string | undefined,
  label: string | undefined,
  exp: number,
  nonce: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${SCOPE}:${jobId}:${roundGeneration}:${kind}:${path ?? ''}:${label ?? ''}:${exp}:${nonce}`)
    .digest('hex');
}

function safeEqualHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function mintUploadToken(secret: string, options: MintUploadTokenOptions): string {
  if (!Number.isSafeInteger(options.jobId) || options.jobId <= 0) {
    throw new InvalidAgentTokenError('invalid job id');
  }
  if (!Number.isSafeInteger(options.roundGeneration) || options.roundGeneration < 1) {
    throw new InvalidAgentTokenError('invalid round generation');
  }
  if (options.kind !== 'screenshot' && options.kind !== 'stage') {
    throw new InvalidAgentTokenError('invalid upload kind');
  }
  if (options.kind === 'stage' && (!options.path || !options.path.trim())) {
    throw new InvalidAgentTokenError('path is required for stage uploads');
  }
  const nowMs = options.now ?? Date.now();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_UPLOAD_URL_TTL_SECONDS;
  const exp = Math.floor(nowMs / 1000) + Math.max(1, Math.floor(ttlSeconds));
  const nonce = randomBytes(12).toString('hex');
  const path = options.path?.trim() || undefined;
  const label = options.label?.trim() || undefined;
  const signature = sign(options.jobId, options.roundGeneration, options.kind, path, label, exp, nonce, secret);
  return Buffer.from(
    `${options.jobId}.${options.roundGeneration}.${options.kind}.${encodeOptional(path)}.${encodeOptional(label)}.${exp}.${nonce}.${signature}`,
    'utf8',
  ).toString('base64url');
}

export function verifyUploadToken(token: string, secret: string): UploadTokenClaims {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (parts.length !== 8) {
      throw new InvalidAgentTokenError();
    }
    const [jobIdRaw, generationRaw, kindRaw, pathRaw, labelRaw, expRaw, nonce, signature] = parts;
    if (
      !jobIdRaw ||
      !generationRaw ||
      !kindRaw ||
      pathRaw === undefined ||
      labelRaw === undefined ||
      !expRaw ||
      !nonce ||
      !signature ||
      !/^\d+$/.test(jobIdRaw) ||
      !/^\d+$/.test(generationRaw) ||
      (kindRaw !== 'screenshot' && kindRaw !== 'stage') ||
      !/^\d+$/.test(expRaw) ||
      !/^[a-f0-9]+$/i.test(nonce) ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      throw new InvalidAgentTokenError();
    }
    const jobId = Number.parseInt(jobIdRaw, 10);
    const roundGeneration = Number.parseInt(generationRaw, 10);
    const exp = Number.parseInt(expRaw, 10);
    const kind = kindRaw as UploadKind;
    const path = decodeOptional(pathRaw);
    const label = decodeOptional(labelRaw);
    if (
      !Number.isSafeInteger(jobId) ||
      jobId <= 0 ||
      !Number.isSafeInteger(roundGeneration) ||
      roundGeneration < 1 ||
      !Number.isSafeInteger(exp) ||
      exp <= 0
    ) {
      throw new InvalidAgentTokenError();
    }
    if (!safeEqualHex(signature, sign(jobId, roundGeneration, kind, path, label, exp, nonce, secret))) {
      throw new InvalidAgentTokenError();
    }
    return {
      jobId,
      roundGeneration,
      kind,
      ...(path ? { path } : {}),
      ...(label ? { label } : {}),
      exp,
      nonce,
    };
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) throw error;
    throw new InvalidAgentTokenError();
  }
}

export function assertUploadTokenUnexpired(claims: UploadTokenClaims, nowMs: number = Date.now()): void {
  if (claims.exp * 1000 <= nowMs) {
    throw new InvalidAgentTokenError(STALE_AGENT_TOKEN_REASON);
  }
}

// Explicit Content-Type: no parser claims a missing one.
export function uploadCurlCommand(url: string, localPath: string, contentType: string): string {
  const escaped = url.replace(/'/g, `'\\''`);
  return `curl -H 'Content-Type: ${contentType}' --upload-file ${localPath} '${escaped}'`;
}
