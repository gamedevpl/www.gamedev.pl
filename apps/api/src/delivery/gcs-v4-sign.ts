// V4 signing core for read and upload URLs.

import { createHash } from 'node:crypto';

// Long enough to curl|tar, short enough to leak slowly.
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

export interface SignGcsReadUrlOptions {
  bucket: string;
  object: string;
  // Seconds until expiry; GCS V4 caps it at 7 days.
  expiresSeconds?: number;
  now?: () => number;
  // RSA-SHA256 of the string-to-sign, base64 (IAM signBlob shape).
  signBlob: (stringToSign: string) => Promise<string>;
  // Embedded in X-Goog-Credential.
  serviceAccountEmail: string;
}

export interface SignGcsUploadUrlOptions extends SignGcsReadUrlOptions {
  contentType: string;
}

// Same as games-store.ts direct writes.
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// Headers a signed PUT must send verbatim.
export function gcsUploadHeaders(contentType: string): Record<string, string> {
  return { 'content-type': contentType, 'cache-control': IMMUTABLE_CACHE_CONTROL };
}

// One object, one Content-Type; replacing is the signer's IAM.
export async function signGcsUploadUrl(options: SignGcsUploadUrlOptions): Promise<string> {
  return signGcsUrl(options, 'PUT', gcsUploadHeaders(options.contentType));
}

export async function signGcsUrl(
  options: SignGcsReadUrlOptions,
  method: 'GET' | 'PUT',
  extraHeaders: Record<string, string>,
): Promise<string> {
  const expiresSeconds = Math.min(
    Math.max(1, options.expiresSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS),
    7 * 24 * 60 * 60,
  );
  const nowMs = (options.now ?? Date.now)();
  const at = new Date(nowMs);
  const datestamp = formatUtc(at, 'date');
  const timestamp = formatUtc(at, 'datetime');
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${options.serviceAccountEmail}/${credentialScope}`;

  const host = 'storage.googleapis.com';
  const canonicalUri = `/${options.bucket}/${options.object
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

  const headers: Record<string, string> = { host, ...extraHeaders };
  const headerNames = Object.keys(headers).sort();
  const signedHeaders = headerNames.join(';');

  const query: Record<string, string> = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': timestamp,
    'X-Goog-Expires': String(expiresSeconds),
    'X-Goog-SignedHeaders': signedHeaders,
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`)
    .join('&');

  const canonicalHeaders = headerNames.map((name) => `${name}:${headers[name].trim()}\n`).join('');
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'GOOG4-RSA-SHA256',
    timestamp,
    credentialScope,
    createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n');

  const signatureB64 = await options.signBlob(stringToSign);
  const signatureHex = Buffer.from(signatureB64, 'base64').toString('hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signatureHex}`;
}

function formatUtc(at: Date, kind: 'date' | 'datetime'): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, '0');
  const d = String(at.getUTCDate()).padStart(2, '0');
  if (kind === 'date') return `${y}${m}${d}`;
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  const ss = String(at.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}
