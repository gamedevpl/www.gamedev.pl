import { describe, expect, it } from 'vitest';
import { deriveStatus, extractSlugFromChangedFiles, sanitizeCreatorText } from './submission-status.js';
import type { LinkedPullRequest } from './github-client.js';

function pr(overrides: Partial<LinkedPullRequest> = {}): LinkedPullRequest {
  return {
    number: 1,
    state: 'OPEN',
    merged: false,
    isDraft: false,
    titleHasWip: false,
    headRefName: 'agent/game',
    changedFiles: ['games/sky-dodge/index.html'],
    ...overrides,
  };
}

const published = async () => true;
const notPublished = async () => false;

describe('deriveStatus', () => {
  it('queued: open issue, no linked PR', async () => {
    expect(await deriveStatus('open', null, notPublished)).toEqual({ status: 'queued' });
  });

  it('needs_changes: closed issue, no linked PR', async () => {
    expect(await deriveStatus('closed', null, notPublished)).toEqual({ status: 'needs_changes' });
  });

  it('needs_changes: PR closed unmerged and issue closed', async () => {
    expect(await deriveStatus('closed', pr({ state: 'CLOSED' }), notPublished)).toEqual({ status: 'needs_changes' });
  });

  it('queued: PR closed unmerged but issue still open (agent may retry)', async () => {
    expect(await deriveStatus('open', pr({ state: 'CLOSED' }), notPublished)).toEqual({ status: 'queued' });
  });

  it('building: open draft PR with a game dir', async () => {
    const result = await deriveStatus('open', pr({ isDraft: true }), notPublished);
    expect(result.status).toBe('building');
    expect(result.preview).toEqual({ slug: 'sky-dodge' });
  });

  it('building: open PR whose title carries a WIP marker', async () => {
    expect((await deriveStatus('open', pr({ titleHasWip: true }), notPublished)).status).toBe('building');
  });

  it('in_review: open, non-draft, non-WIP PR', async () => {
    expect((await deriveStatus('open', pr(), notPublished)).status).toBe('in_review');
  });

  it('publishing: merged PR whose slug is not yet in the published catalog', async () => {
    expect(await deriveStatus('open', pr({ merged: true, state: 'MERGED' }), notPublished)).toEqual({
      status: 'publishing',
      slug: 'sky-dodge',
    });
  });

  it('publishing: merged PR with no game directory in the diff', async () => {
    const merged = pr({ merged: true, state: 'MERGED', changedFiles: ['README.md'] });
    expect(await deriveStatus('open', merged, published)).toEqual({ status: 'publishing' });
  });

  it('published: merged PR whose slug is live in the catalog', async () => {
    expect(await deriveStatus('open', pr({ merged: true, state: 'MERGED' }), published)).toEqual({
      status: 'published',
      slug: 'sky-dodge',
    });
  });

  it('mines commits and checklist into progress on an open PR', async () => {
    const result = await deriveStatus(
      'open',
      pr({
        headRefOid: 'abc123',
        body: '- [x] Scaffold\n- [ ] Add scoring',
        commits: [{ message: 'init', committedDate: '2026-07-24T00:00:00Z' }],
      }),
      notPublished,
    );
    expect(result.progress?.headSha).toBe('abc123');
    expect(result.progress?.checklist).toEqual([
      { text: 'Scaffold', checked: true },
      { text: 'Add scoring', checked: false },
    ]);
    expect(result.progress?.commits).toEqual([{ message: 'init', committedDate: '2026-07-24T00:00:00Z' }]);
  });
});

describe('extractSlugFromChangedFiles', () => {
  it('returns the first games/<slug>/ directory', () => {
    expect(extractSlugFromChangedFiles(['README.md', 'games/foo/index.html', 'games/bar/x.js'])).toBe('foo');
  });
  it('returns null when no game directory is touched', () => {
    expect(extractSlugFromChangedFiles(['docs/x.md'])).toBeNull();
  });
});

describe('sanitizeCreatorText', () => {
  it('strips HTML and markdown control characters', () => {
    expect(sanitizeCreatorText('<b>hi</b> **there** [link](http://x)', { singleLine: true })).toBe('hi there link');
  });
  it('collapses blank lines in multi-line mode', () => {
    expect(sanitizeCreatorText('a\n\n\n\nb', { singleLine: false })).toBe('a\n\nb');
  });
});
