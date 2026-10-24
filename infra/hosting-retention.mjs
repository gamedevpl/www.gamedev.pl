import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const METADATA_PATH = /^\/assets\/retention-[a-f0-9]{64}\.json$/;
const HASH = /^[a-f0-9]{64}$/;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function validateAssetPath(name) {
  if (
    !/^\/assets\/[A-Za-z0-9_./-]+$/.test(name) ||
    name
      .split('/')
      .slice(2)
      .some((p) => !p || p === '.' || p === '..')
  ) {
    throw new Error(`Invalid asset path: ${name}`);
  }
}

export function packFile(raw) {
  const bytes = Buffer.from(raw);
  const compressed = gzipSync(bytes, { level: 9 });
  return { raw: bytes, compressed, hash: sha256(compressed) };
}

export async function readAssets(directory, prefix = '/assets') {
  const files = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}/${entry.name}`;
    validateAssetPath(name);
    if (name.startsWith('/assets/retention-')) throw new Error('Reserved retention metadata namespace');
    const local = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of await readAssets(local, name)) files.set(key, value);
    } else if (entry.isFile()) {
      files.set(name, packFile(await readFile(local)));
    } else {
      throw new Error(`Non-regular asset: ${name}`);
    }
  }
  return files;
}

export function parseLedger(raw, name, liveFiles) {
  if (!METADATA_PATH.test(name) || name !== `/assets/retention-${sha256(raw)}.json`) {
    throw new Error('Retention metadata digest mismatch');
  }
  const ledger = JSON.parse(raw);
  if (ledger?.version !== 1 || !ledger.files || typeof ledger.files !== 'object' || Array.isArray(ledger.files))
    throw new Error('Invalid retention metadata');
  const files = new Map(Object.entries(ledger.files));
  for (const [key, entry] of files) {
    validateAssetPath(key);
    if (
      METADATA_PATH.test(key) ||
      !entry ||
      !HASH.test(entry.hash) ||
      liveFiles.get(key) !== entry.hash ||
      (entry.expiresAt !== null && (!Number.isSafeInteger(entry.expiresAt) || entry.expiresAt <= 0))
    ) {
      throw new Error(`Invalid retained asset: ${key}`);
    }
  }
  if (files.size !== liveFiles.size - 1) throw new Error('Retention metadata does not cover the live assets');
  return files;
}

export function planAssets(current, previous, now) {
  if (!current.size || !Number.isSafeInteger(now) || now <= 0) throw new Error('Empty build or invalid clock');
  const files = new Map();
  for (const [name, entry] of previous) {
    const expiresAt = entry.expiresAt ?? now + RETENTION_MS;
    if (expiresAt > now) files.set(name, { hash: entry.hash, expiresAt });
  }
  for (const [name, file] of current) {
    validateAssetPath(name);
    if (previous.has(name) && previous.get(name).hash !== file.hash)
      throw new Error(`Immutable asset collision: ${name}`);
    files.set(name, { hash: file.hash, expiresAt: null });
  }
  const ordered = Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)));
  const metadata = packFile(JSON.stringify({ version: 1, files: ordered }));
  const metadataPath = `/assets/retention-${sha256(metadata.raw)}.json`;
  const manifest = new Map([...files].map(([name, entry]) => [name, entry.hash]));
  manifest.set(metadataPath, metadata.hash);
  const uploads = new Map([...current.values(), metadata].map((file) => [file.hash, file.compressed]));
  const retained = [...files].filter(([, entry]) => entry.expiresAt !== null).map(([name]) => name);
  return { manifest, uploads, metadataPath, retained };
}

export function servingConfig(hosting) {
  const allowed = ['site', 'public', 'ignore', 'headers', 'rewrites'];
  if (Object.keys(hosting).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported Hosting config property');
  return {
    headers: hosting.headers.map(({ source, headers, ...rest }) => {
      if (!source || Object.keys(rest).length) throw new Error('Unsupported Hosting header');
      return { glob: source, headers: Object.fromEntries(headers.map(({ key, value }) => [key, value])) };
    }),
    rewrites: hosting.rewrites.map(({ source, run, ...rest }) => {
      if (!source || !run?.serviceId || !run.region || Object.keys(rest).length)
        throw new Error('Unsupported Hosting rewrite');
      return { glob: source, run };
    }),
  };
}
