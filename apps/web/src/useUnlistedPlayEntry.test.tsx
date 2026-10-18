// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, normalizeCatalogEntry, type CatalogEntry } from './catalog.js';
import type { GamePage } from './gamePageApi.js';
import { useUnlistedPlayEntry, type UnlistedPlayLookup } from './useUnlistedPlayEntry.js';

const raw = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  title: slug,
  genre: 'arcade',
  controls: 'keys',
  status: 'published',
  ...extra,
});
const entry = (slug: string, extra: Record<string, unknown> = {}) => normalizeCatalogEntry(raw(slug, extra))!;

async function lookup(slug: string, catalog: CatalogEntry[], page: CatalogEntry | Error) {
  const fetchPage = vi.fn(async (): Promise<GamePage> => {
    if (page instanceof Error) throw page;
    return { entry: page, creator: null, platformAuthored: true, description: null };
  });
  const seen: UnlistedPlayLookup[] = [];
  function Probe() {
    seen.push(useUnlistedPlayEntry({ slug, catalogEntries: catalog, catalogStatus: 'ready', fetchPage }));
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<Probe />);
  });
  act(() => root.unmount());
  return { first: seen[0]!, last: seen.at(-1)!, fetchPage };
}

describe('unlisted games on the web', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps listed: false on a normalized entry and off the catalog grid', async () => {
    expect(entry('hidden', { listed: false }).listed).toBe(false);
    expect(entry('shown')).not.toHaveProperty('listed');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([raw('shown'), raw('hidden', { listed: false })])),
    );
    expect((await fetchCatalog()).map((game) => game.slug)).toEqual(['shown']);
  });

  it('resolves an unlisted /play link from its game page', async () => {
    const hidden = entry('hidden', { listed: false });
    const { first, last } = await lookup('hidden', [entry('shown')], hidden);
    expect(first.unlistedLoading).toBe(true);
    expect(last.unlistedLoading).toBe(false);
    expect(last.playableEntries.map((game) => game.slug)).toEqual(['shown', 'hidden']);
  });

  it('adds nothing for a listed game page or a miss', async () => {
    for (const page of [entry('draft'), new Error('not_found')]) {
      const { last } = await lookup('draft', [entry('shown')], page);
      expect(last).toMatchObject({ unlistedLoading: false });
      expect(last.playableEntries.map((game) => game.slug)).toEqual(['shown']);
    }
  });

  it('skips the lookup for a slug the catalog already lists', async () => {
    const { first, fetchPage } = await lookup('shown', [entry('shown')], entry('shown'));
    expect(first.unlistedLoading).toBe(false);
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
