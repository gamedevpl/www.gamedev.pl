/**
 * GCS V4 signed read URLs using the runtime service account (IAM signBlob).
 *
 * Deliberately avoids `@google-cloud/storage`: the API already talks to GCS over
 * `fetch` + ADC (games-store.ts, game-snapshot.ts), and signed URLs are one more
 * verb on that seam. Tests inject {@link signBlob} / {@link serviceAccountEmail}.
 *
 * Spec: https://cloud.google.com/storage/docs/access-control/signing-urls-manually
 */

import { GoogleAuth } from 'google-auth-library';
import {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  signGcsUploadUrl,
  signGcsUrl,
  type SignGcsReadUrlOptions,
} from './gcs-v4-sign.js';

export { DEFAULT_SIGNED_URL_TTL_SECONDS, type SignGcsReadUrlOptions };

/**
 * Builds a V4 GET signed URL for one object. The caller must already know the
 * object exists (or accept that the URL 404s when followed).
 */
export async function signGcsReadUrl(options: SignGcsReadUrlOptions): Promise<string> {
  return signGcsUrl(options, 'GET', {});
}

export interface GcsObjectStore {
  /** Raw object bytes, or null when the object is absent. */
  readObject(name: string): Promise<Buffer | null>;
  /** Metadata probe — true when the object exists. Does not download the body. */
  objectExists(name: string): Promise<boolean>;
  // V4 GET URL. signedAtMs pins the instant, which anchors media URLs.
  signReadUrl(name: string, expiresSeconds?: number, signedAtMs?: number): Promise<string>;
  // Optional: only the gate artifact route signs uploads.
  signUploadUrl?(name: string, contentType: string, expiresSeconds?: number): Promise<string>;
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

    async signReadUrl(name, expiresSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS, signedAtMs) {
      const email = await resolveEmail();
      return signGcsReadUrl({
        bucket,
        object: name,
        expiresSeconds,
        now: signedAtMs === undefined ? now : () => signedAtMs,
        serviceAccountEmail: email,
        signBlob,
      });
    },

    async signUploadUrl(name, contentType, expiresSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS) {
      const email = await resolveEmail();
      return signGcsUploadUrl({
        bucket,
        object: name,
        contentType,
        expiresSeconds,
        now,
        serviceAccountEmail: email,
        signBlob,
      });
    },
  };
}
