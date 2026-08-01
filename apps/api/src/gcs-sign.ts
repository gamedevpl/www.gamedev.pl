/**
 * GCS V4 signed read URLs using the runtime service account (IAM signBlob).
 *
 * Deliberately avoids `@google-cloud/storage`: the API already talks to GCS over
 * `fetch` + ADC (games-store.ts, game-snapshot.ts), and signed URLs are one more
 * verb on that seam. Tests inject {@link signBlob} / {@link serviceAccountEmail}.
 *
 * Spec: https://cloud.google.com/storage/docs/access-control/signing-urls-manually
 */

import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';

/** Default kit/example download window — long enough to curl|tar, short enough to leak slowly. */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

export interface SignGcsReadUrlOptions {
  bucket: string;
  object: string;
  /** Seconds from `now` until the URL stops working. Capped at 7 days by GCS V4. */
  expiresSeconds?: number;
  now?: () => number;
  /** RSA-SHA256 over the V4 string-to-sign; returns base64 digest (IAM signBlob shape). */
  signBlob: (stringToSign: string) => Promise<string>;
  /** Service account email embedded in X-Goog-Credential. */
  serviceAccountEmail: string;
}

/**
 * Builds a V4 GET signed URL for one object. The caller must already know the
 * object exists (or accept that the URL 404s when followed).
 */
export async function signGcsReadUrl(options: SignGcsReadUrlOptions): Promise<string> {
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

  const query: Record<string, string> = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': timestamp,
    'X-Goog-Expires': String(expiresSeconds),
    'X-Goog-SignedHeaders': 'host',
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = ['GET', canonicalUri, canonicalQuery, canonicalHeaders, 'host', 'UNSIGNED-PAYLOAD'].join(
    '\n',
  );

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

export interface GcsObjectStore {
  /** Raw object bytes, or null when the object is absent. */
  readObject(name: string): Promise<Buffer | null>;
  /** Metadata probe — true when the object exists. Does not download the body. */
  objectExists(name: string): Promise<boolean>;
  /** Short-lived V4 GET URL for an existing object. */
  signReadUrl(name: string, expiresSeconds?: number): Promise<string>;
}

export interface CreateGcsObjectStoreOptions {
  bucket: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  /** Override for tests; production resolves the runtime SA via ADC. */
  serviceAccountEmail?: string | (() => Promise<string>);
  /** Override for tests; production uses GoogleAuth.sign (IAM signBlob / local key). */
  signBlob?: (stringToSign: string) => Promise<string>;
  now?: () => number;
}

/**
 * Read + sign against one GCS bucket — the games-store bucket that also holds
 * `kits/` and (when published) `examples/`.
 */
export function createGcsObjectStore(options: CreateGcsObjectStoreOptions): GcsObjectStore {
  const { bucket } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  let auth: GoogleAuth | null = null;
  const getAuth = () => {
    auth ??= new GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/devstorage.read_write',
        'https://www.googleapis.com/auth/cloud-platform',
      ],
    });
    return auth;
  };

  const getAccessToken =
    options.getAccessToken ??
    (async () => {
      const token = await getAuth().getAccessToken();
      if (!token) throw new Error('could not obtain a Google access token for the games store');
      return token;
    });

  const resolveEmail =
    typeof options.serviceAccountEmail === 'function'
      ? options.serviceAccountEmail
      : options.serviceAccountEmail
        ? async () => options.serviceAccountEmail as string
        : async () => {
            const creds = await getAuth().getCredentials();
            if (!creds.client_email) {
              throw new Error('could not resolve the runtime service account email for URL signing');
            }
            return creds.client_email;
          };

  const signBlob =
    options.signBlob ??
    (async (stringToSign: string) => {
      // GoogleAuth.sign returns base64 (IAM signedBlob / local RSA).
      return getAuth().sign(stringToSign);
    });

  return {
    async readObject(name) {
      const url =
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/` +
        `${encodeURIComponent(name)}?alt=media`;
      const response = await fetchImpl(url, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`games store read of ${name} failed: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },

    async objectExists(name) {
      const url =
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/` + `${encodeURIComponent(name)}`;
      const response = await fetchImpl(url, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`games store head of ${name} failed: ${response.status}`);
      return true;
    },

    async signReadUrl(name, expiresSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS) {
      const email = await resolveEmail();
      return signGcsReadUrl({
        bucket,
        object: name,
        expiresSeconds,
        now,
        serviceAccountEmail: email,
        signBlob,
      });
    },
  };
}
