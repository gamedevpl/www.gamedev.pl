import { describe, expect, it } from 'vitest';
import { sealRefusal } from './seal-preview.js';

const READY = {
  state: 'ready_for_review' as const,
  slug: 'comet-courier',
  previewVersion: 'v1',
  deliveredVersion: undefined,
};

describe('sealRefusal', () => {
  it('lets a green preview-only round through', () => {
    expect(sealRefusal(READY)).toBeNull();
  });

  it('refuses a round that is not waiting on review', () => {
    expect(sealRefusal({ ...READY, state: 'building' })).toBe('not_reviewable');
    expect(sealRefusal({ ...READY, state: 'published' })).toBe('not_reviewable');
  });

  it('refuses a round that already has a publishable candidate', () => {
    expect(sealRefusal({ ...READY, deliveredVersion: 'v2' })).toBe('already_delivered');
  });

  it('refuses a round with nothing to promote', () => {
    expect(sealRefusal({ ...READY, previewVersion: undefined })).toBe('no_preview');
  });

  it('refuses a round with no address to publish under', () => {
    expect(sealRefusal({ ...READY, slug: undefined })).toBe('no_slug');
  });
});
