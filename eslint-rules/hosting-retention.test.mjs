import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { releaseAssets } from '../infra/hosting-release.mjs';
import { METADATA_PATH, packFile, RETENTION_MS, sha256 } from '../infra/hosting-retention.mjs';

const hosting = JSON.parse(readFileSync(new URL('../infra/firebase/firebase.json', import.meta.url))).hosting;
const temporary = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function firebase(seed = { 'App-old.js': 'old app', 'en-old.js': 'old locale', 'old.css': 'old css' }) {
  const blobs = new Map();
  const initial = new Map(
    Object.entries(seed).map(([name, content]) => {
      const file = packFile(content);
      blobs.set(file.hash, file.compressed);
      return [`/assets/${name}`, file.hash];
    }),
  );
  const versions = new Map([['sites/gamedevpl/versions/initial', initial]]);
  const state = { live: 'sites/gamedevpl/versions/initial', releases: 0, calls: [], blobs, versions, created: 0 };
  const json = (value) => new Response(JSON.stringify(value));
  const fetchImpl = async (url, options) => {
    state.calls.push({ url, ...options });
    const address = new URL(url);
    const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null;
    if (address.hostname === 'gamedevpl.web.app') {
      expect(options.headers?.Authorization).toBeUndefined();
      const hash = versions.get(state.live).get(address.pathname);
      if (state.releases && state.breakProbe === address.pathname) return new Response('missing', { status: 404 });
      return hash && blobs.has(hash)
        ? new Response(gunzipSync(blobs.get(hash)))
        : new Response('missing', { status: 404 });
    }
    expect(options.headers.Authorization).toBe('Bearer test-token');
    if (address.hostname === 'upload-firebasehosting.googleapis.com') {
      expect(sha256(options.body)).toBe(address.pathname.split('/').at(-1));
      blobs.set(sha256(options.body), options.body);
      return new Response('');
    }
    expect(address.hostname).toBe('firebasehosting.googleapis.com');
    const resource = address.pathname.replace('/v1beta1/', '');
    if (resource === 'sites/gamedevpl/releases') {
      if (options.method === 'POST') {
        state.live = address.searchParams.get('versionName');
        state.releases++;
        return json({});
      }
      return json({ releases: [{ type: 'DEPLOY', version: { name: state.live, status: 'FINALIZED' } }] });
    }
    if (resource === 'sites/gamedevpl/versions') {
      const name = `sites/gamedevpl/versions/new${++state.created}`;
      versions.set(name, new Map());
      state.config = body.config;
      return json({ name });
    }
    if (resource.endsWith(':populateFiles')) {
      const name = resource.replace(':populateFiles', '');
      const required = new Set();
      for (const [key, hash] of Object.entries(body.files)) {
        versions.get(name).set(key, hash);
        if (!blobs.has(hash) || state.requireHash === hash) required.add(hash);
      }
      return json({
        uploadRequiredHashes: [...required],
        uploadUrl: state.uploadUrl ?? `https://upload-firebasehosting.googleapis.com/upload/${name}/files`,
      });
    }
    if (resource.endsWith('/files')) {
      expect(address.searchParams.get('status')).toBe('ACTIVE');
      const name = resource.slice(0, -6);
      const files = [...versions.get(name)].filter(
        ([key]) => !(state.omitFinalized === key && name !== 'sites/gamedevpl/versions/initial'),
      );
      const start = Number(address.searchParams.get('pageToken'));
      const end = start + 2;
      return json({
        files: files.slice(start, end).map(([key, hash]) => ({ path: key, hash, status: 'ACTIVE' })),
        ...(end < files.length ? { nextPageToken: String(end) } : {}),
      });
    }
    if (options.method === 'PATCH') {
      expect(address.searchParams.get('updateMask')).toBe('status');
      expect(body.status).toBe('FINALIZED');
      for (const hash of versions.get(resource).values()) expect(blobs.has(hash)).toBe(true);
      if (state.concurrentRelease) state.live = state.concurrentRelease;
      return json({ status: 'FINALIZED' });
    }
    throw new Error(`Unhandled fixture request: ${options.method} ${url}`);
  };
  state.deploy = async (files, now, extra = {}) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hosting-retention-'));
    temporary.push(directory);
    await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(directory, name), content)));
    return releaseAssets({
      site: 'gamedevpl',
      project: 'gamedevpl',
      token: 'test-token',
      assetDir: directory,
      hosting,
      now,
      fetchImpl,
      wait: async () => {},
      ...extra,
    });
  };
  state.liveFiles = () => versions.get(state.live);
  state.ledger = () =>
    JSON.parse(gunzipSync(blobs.get([...state.liveFiles()].find(([key]) => METADATA_PATH.test(key))[1])));
  return state;
}

const start = Date.parse('2026-10-24T12:00:00Z');
const day = RETENTION_MS / 7;

describe('Firebase asset retention deployment', () => {
  it('keeps retired imports at their original URLs through multiple deploys and expires them after seven days', async () => {
    const service = firebase();
    await service.deploy({ 'App-new.js': 'new app' }, start);
    expect(service.ledger().files['/assets/App-old.js'].expiresAt).toBe(start + RETENTION_MS);
    expect(service.ledger().files['/assets/App-new.js'].expiresAt).toBeNull();
    for (const version of service.versions.keys()) if (version !== service.live) service.versions.delete(version);
    const referenced = new Set(service.liveFiles().values());
    for (const hash of service.blobs.keys()) if (!referenced.has(hash)) service.blobs.delete(hash);
    await service.deploy({ 'App-third.js': 'third app' }, start + day);
    expect(service.ledger().files['/assets/App-old.js'].expiresAt).toBe(start + RETENTION_MS);
    expect(service.ledger().files['/assets/App-new.js'].expiresAt).toBe(start + day + RETENTION_MS);
    await service.deploy({ 'App-third.js': 'third app' }, start + RETENTION_MS - 1);
    expect(service.liveFiles().has('/assets/App-old.js')).toBe(true);
    await service.deploy({ 'App-third.js': 'third app' }, start + RETENTION_MS);
    expect(service.liveFiles().has('/assets/App-old.js')).toBe(false);
    expect(service.liveFiles().has('/assets/App-new.js')).toBe(true);
    expect([...service.liveFiles().keys()].filter((key) => METADATA_PATH.test(key))).toHaveLength(1);
  });

  it('starts the grace period when a long-lived current build is replaced and resets returning assets', async () => {
    const service = firebase();
    await service.deploy({ 'App-current.js': 'current' }, start);
    await service.deploy({ 'App-next.js': 'next' }, start + 30 * day);
    expect(service.ledger().files['/assets/App-current.js'].expiresAt).toBe(start + 37 * day);
    await service.deploy({ 'App-current.js': 'current' }, start + 31 * day);
    expect(service.ledger().files['/assets/App-current.js'].expiresAt).toBeNull();
    await service.deploy({ 'App-next.js': 'next' }, start + 45 * day);
    expect(service.ledger().files['/assets/App-current.js'].expiresAt).toBe(start + 52 * day);
  });

  it('publishes assets only, preserves CDN headers and the Cloud Run rewrite, and uploads only missing blobs', async () => {
    const service = firebase();
    await service.deploy({ 'App-new.js': 'new app', 'pl-new.js': 'new locale', 'new.css': 'new css' }, start);
    expect(service.config).toEqual({
      headers: [{ glob: '/assets/**', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }],
      rewrites: [{ glob: '**', run: { serviceId: 'gamedev-app', region: 'europe-west1' } }],
    });
    expect([...service.liveFiles().keys()].every((key) => key.startsWith('/assets/'))).toBe(true);
    expect(service.calls.filter((call) => call.url.startsWith('https://upload-'))).toHaveLength(4);
    const probes = service.calls.filter((call) => call.url.includes('?release='));
    expect(probes.some((call) => call.url.includes('App-old.js'))).toBe(true);
    expect(probes.some((call) => call.url.includes('en-old.js'))).toBe(true);
  });

  it('reuses older gzip encodings when raw immutable bytes are unchanged', async () => {
    const service = firebase({ 'App-old.js': 'export const repeated = "test";'.repeat(100) });
    const raw = gunzipSync(service.blobs.get(service.liveFiles().get('/assets/App-old.js')));
    const alternate = gzipSync(raw, { level: 1 });
    expect(sha256(alternate)).not.toBe(packFile(raw).hash);
    service.blobs.set(sha256(alternate), alternate);
    service.liveFiles().set('/assets/App-old.js', sha256(alternate));
    await service.deploy({ 'App-old.js': raw, 'App-next.js': 'next' }, start);
    expect(service.liveFiles().get('/assets/App-old.js')).toBe(sha256(alternate));
    await service.deploy({ 'App-next.js': 'next' }, start + day);
    expect(service.liveFiles().has('/assets/App-old.js')).toBe(true);
  });

  it('refuses to overwrite an immutable URL with changed content', async () => {
    const service = firebase();
    await expect(service.deploy({ 'App-old.js': 'changed' }, start)).rejects.toThrow('Immutable asset collision');
    expect(service.created).toBe(0);
  });

  it('refuses to publish when Hosting requests a missing retained blob', async () => {
    const service = firebase();
    service.requireHash = service.liveFiles().get('/assets/App-old.js');
    await expect(service.deploy({ 'App-new.js': 'new' }, start)).rejects.toThrow('lost a retained blob');
    expect(service.releases).toBe(0);
  });

  it('rejects an incomplete finalized manifest before releasing', async () => {
    const service = firebase();
    service.omitFinalized = '/assets/en-old.js';
    await expect(service.deploy({ 'App-new.js': 'new' }, start)).rejects.toThrow('complete asset manifest');
    expect(service.releases).toBe(0);
  });

  it('rejects corrupt metadata before modifying Hosting', async () => {
    const service = firebase();
    await service.deploy({ 'App-new.js': 'new' }, start);
    const ledgerHash = [...service.liveFiles()].find(([key]) => METADATA_PATH.test(key))[1];
    service.blobs.set(ledgerHash, packFile('{}').compressed);
    await expect(service.deploy({ 'App-next.js': 'next' }, start + day)).rejects.toThrow('digest mismatch');
    expect(service.created).toBe(1);
  });

  it('rejects a ledger which silently drops a live file', async () => {
    const service = firebase();
    await service.deploy({ 'App-new.js': 'new' }, start);
    const ledger = service.ledger();
    delete ledger.files['/assets/en-old.js'];
    const packed = packFile(JSON.stringify(ledger));
    service.blobs.set(packed.hash, packed.compressed);
    service.liveFiles().delete([...service.liveFiles().keys()].find((key) => METADATA_PATH.test(key)));
    service.liveFiles().set(`/assets/retention-${sha256(packed.raw)}.json`, packed.hash);
    await expect(service.deploy({ 'App-next.js': 'next' }, start + day)).rejects.toThrow('does not cover');
    expect(service.releases).toBe(1);
  });

  it('stops when a concurrent publisher changes the live release', async () => {
    const service = firebase();
    service.concurrentRelease = 'sites/gamedevpl/versions/concurrent';
    await expect(service.deploy({ 'App-new.js': 'new' }, start)).rejects.toThrow('changed during upload');
    expect(service.releases).toBe(0);
  });

  it('fails the deploy gate when old assets cannot be fetched after release', async () => {
    const service = firebase();
    service.breakProbe = '/assets/App-old.js';
    await expect(service.deploy({ 'App-new.js': 'new' }, start)).rejects.toThrow('Released asset verification failed');
    expect(service.releases).toBe(1);
    expect(service.calls.filter((call) => call.url.includes('App-old.js?release='))).toHaveLength(5);
  });

  it('does not forward credentials to an unexpected upload host', async () => {
    const service = firebase();
    service.uploadUrl = 'https://unexpected.example/upload';
    await expect(service.deploy({ 'App-new.js': 'new' }, start)).rejects.toThrow(
      'Unexpected Hosting upload destination',
    );
    expect(service.calls.some((call) => call.url.includes('unexpected.example'))).toBe(false);
    expect(service.releases).toBe(0);
  });

  it('splits manifests into API-sized batches and reads all ACTIVE pages', async () => {
    const seed = Object.fromEntries(Array.from({ length: 1005 }, (_, i) => [`asset-${i}.js`, `module ${i}`]));
    const service = firebase(seed);
    await service.deploy({ 'App-new.js': 'new' }, start);
    const batches = service.calls.filter((call) => call.url.endsWith(':populateFiles'));
    expect(batches.map((call) => Object.keys(JSON.parse(call.body).files).length)).toEqual([1000, 7]);
    expect(service.liveFiles().size).toBe(1007);
  });

  it('supports a read-only dry run and rejects empty builds', async () => {
    const service = firebase();
    expect(await service.deploy({ 'App-new.js': 'new' }, start, { dryRun: true })).toMatchObject({
      retained: 3,
      files: 5,
      dryRun: true,
    });
    expect(service.calls.every((call) => !call.method || call.method === 'GET')).toBe(true);
    await expect(service.deploy({}, start)).rejects.toThrow('Empty build');
    expect(service.created).toBe(0);
  });

  it('runs the retention gate before traffic promotion and pruning in production', () => {
    const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
    const release = workflow.indexOf('node infra/deploy-hosting.mjs');
    const promotion = workflow.indexOf('- name: Promote candidate revision to 100% traffic');
    const prune = workflow.indexOf('- name: Prune old Firebase Hosting versions');
    expect(release).toBeGreaterThan(0);
    expect(release).toBeLessThan(promotion);
    expect(promotion).toBeLessThan(prune);
    expect(workflow).not.toMatch(/firebase-tools[^\n]* deploy/);
  });
});
