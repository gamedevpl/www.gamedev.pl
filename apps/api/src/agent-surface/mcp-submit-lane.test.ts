import { describe, expect, it } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import type { SubmissionRecord } from '../platform/store.js';
import { effectiveSubmitMode } from './mcp-source-submit-tools.js';

const RECORD = { slug: 'comet-courier', deliveredVersion: 'v1' } as SubmissionRecord;

function storeWith(manifest: Record<string, unknown> | null | Error): GamesStore {
  return {
    getManifest: async () => {
      if (manifest instanceof Error) throw manifest;
      return manifest;
    },
  } as unknown as GamesStore;
}

describe('effectiveSubmitMode', () => {
  it('defaults a fresh delivery to preview and honours an explicit mode', async () => {
    expect(await effectiveSubmitMode(undefined, false, RECORD, storeWith(null))).toBe('preview');
    expect(await effectiveSubmitMode('publish', false, RECORD, storeWith(null))).toBe('publish');
    expect(await effectiveSubmitMode('preview', true, RECORD, storeWith({ deliveryMode: 'publish' }))).toBe('preview');
  });

  it('reuses the stored lane on retry, reading a legacy manifest as publish like the channel does', async () => {
    const retry = (manifest: Record<string, unknown>) =>
      effectiveSubmitMode(undefined, true, RECORD, storeWith({ sourceFiles: [], ...manifest }));
    expect(await retry({})).toBe('publish');
    expect(await retry({ deliveryMode: 'publish' })).toBe('publish');
    expect(await retry({ deliveryMode: 'preview' })).toBe('preview');
  });

  it('falls back to preview when the previous lane cannot be read', async () => {
    expect(await effectiveSubmitMode(undefined, true, RECORD, storeWith(null))).toBe('preview');
    expect(await effectiveSubmitMode(undefined, true, RECORD, storeWith(new Error('down')))).toBe('preview');
    expect(await effectiveSubmitMode(undefined, true, RECORD, undefined)).toBe('preview');
    expect(
      await effectiveSubmitMode(undefined, true, { slug: 'comet-courier' } as SubmissionRecord, storeWith({})),
    ).toBe('preview');
  });
});
