import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { createLiveCodeStore } from './live-code-store.js';

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, writeSync: vi.fn(actual.writeSync) };
});

const stores: ReturnType<typeof createLiveCodeStore>[] = [];
const source = (html: string, sourceId = 1) => ({
  sourceId,
  revision: createHash('sha256').update(html).digest('hex'),
});
const fixture = (maxBytes?: number, maxBindings?: number) => {
  const store = createLiveCodeStore(maxBytes, maxBindings);
  stores.push(store);
  return store;
};
afterEach(() => {
  vi.restoreAllMocks();
  stores.splice(0).forEach((store) => store.close());
});

it('retains A → B → A and deduplicates bytes across independently bound sources', () => {
  const store = fixture();
  const a = '<script>let score=1;</script>',
    b = '<script>let score=2;</script>';
  store.retain(source(a), a);
  const firstBytes = store.status().bytes;
  store.retain(source(b), b);
  store.retain(source(a), a);
  expect(store.read(source(a), {})).toMatchObject({ available: true, content: a, nextOffset: null });
  expect(store.read(source(b), {})).toMatchObject({ content: b });
  expect(store.describe(source(a, 2))).toMatchObject({ available: false });
  const twoBytes = store.status().bytes;
  expect(twoBytes).toBeGreaterThan(firstBytes);
  store.retain(source(a, 2), a);
  expect(store.status()).toMatchObject({ artifacts: 2, bindings: 3, bytes: twoBytes });
  expect(store.read(source(a, 2), {})).toMatchObject({ content: a });
});

it('pages exact Unicode text and searches only the retained document', () => {
  const store = fixture();
  const html = 'start 🐈 zażółć 🎮 end';
  const id = source(html);
  store.retain(id, html);
  let offset = 0,
    result = '';
  for (;;) {
    const page = store.read(id, { offset, limit: 3 });
    if (!('content' in page)) throw Error('missing artifact');
    result += page.content;
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  expect(result).toBe(html);
  expect(store.read(id, { find: 'zażółć', limit: 6 })).toMatchObject({ found: true, content: 'zażółć', offset: 9 });
  expect(store.read(id, { find: 'missing' })).toMatchObject({ found: false, content: '', nextOffset: null });
  expect(store.read(id, { offset: html.length })).toMatchObject({ content: '', nextOffset: null });
});

it('rejects mislabeled and oversized documents without reading current files', () => {
  const store = fixture();
  expect(store.retain(source('old'), 'new')).toMatchObject({ available: false });
  expect(store.retain({ sourceId: 1, revision: '../../game.ts' }, 'new')).toMatchObject({ available: false });
  expect(store.retain(source('large'), 'x'.repeat(32 * 1024 * 1024 + 1))).toMatchObject({ available: false });
  expect(store.status()).toMatchObject({ bytes: 0, artifacts: 0, bindings: 0 });
});

it('keeps retained builds readable after compressed capacity or binding limits are reached', () => {
  for (const store of [fixture(40), fixture(undefined, 1)]) {
    store.retain(source('a'), 'a');
    expect(store.retain(source('b'), 'b')).toMatchObject({
      available: false,
      reason: expect.stringContaining('capacity'),
    });
    expect(store.read(source('a'), {})).toMatchObject({ available: true, content: 'a' });
    expect(store.read(source('b'), {})).toMatchObject({ available: false });
    expect(store.status().bindings).toBe(1);
  }
});

it('reports disk failures without losing prior code or breaking the preview', () => {
  const store = fixture();
  store.retain(source('a'), 'a');
  const fail = vi.spyOn(fs, 'writeSync').mockImplementation(() => {
    throw Error('disk full');
  });
  expect(store.retain(source('b'), 'b')).toMatchObject({
    available: false,
    reason: expect.stringContaining('storage failed'),
  });
  fail.mockRestore();
  expect(store.read(source('a'), {})).toMatchObject({ content: 'a' });
  expect(store.status().artifacts).toBe(1);
});

it('closes the archive idempotently and never reopens it', () => {
  const store = fixture();
  store.retain(source('a'), 'a');
  store.close();
  store.close();
  expect(store.read(source('a'), {})).toMatchObject({ available: false });
  expect(store.retain(source('b'), 'b')).toMatchObject({ available: false });
});
