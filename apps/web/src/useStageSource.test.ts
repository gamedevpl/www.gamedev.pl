// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStageSource } from './useStageSource.js';
import { getChannelPlayable, getSubmissionPreview } from './submissionApi.js';
import type { SubmissionStatus } from './submissionApi.js';
import { fetchPublishedGame } from './catalog.js';

vi.mock('./submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return { ...actual, getSubmissionPreview: vi.fn(), getChannelPlayable: vi.fn() };
});

vi.mock('./catalog.js', async () => {
  const actual = await vi.importActual<typeof import('./catalog.js')>('./catalog.js');
  return { ...actual, fetchPublishedGame: vi.fn() };
});

const mockedGetSubmissionPreview = vi.mocked(getSubmissionPreview);
const mockedGetChannelPlayable = vi.mocked(getChannelPlayable);
const mockedFetchPublishedGame = vi.mocked(fetchPublishedGame);

function statusFor(slug: string, headSha: string): SubmissionStatus {
  return {
    status: 'building',
    preview: { slug },
    progress: { headSha, commits: [], checklist: [], revisions: [] },
  };
}

/** Renders the hook and reports what it returned on the most recent settled render. */
function probe() {
  let latest: ReturnType<typeof useStageSource> | null = null;
  function Probe(props: {
    token: string;
    status: SubmissionStatus | null;
    options?: { selectedPreviewVersion?: string | null };
  }) {
    latest = useStageSource(props.token, props.status, props.options);
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    render: async (
      token: string,
      status: SubmissionStatus | null,
      options?: { selectedPreviewVersion?: string | null },
    ) => {
      await act(async () => {
        root.render(createElement(Probe, { token, status, options }));
      });
    },
    latest: () => latest!,
    root,
  };
}

describe('useStageSource', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionPreview.mockReset();
    mockedGetChannelPlayable.mockReset();
    mockedFetchPublishedGame.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('never shows the previous game under the new token — reset happens on the same render as the switch', async () => {
    mockedGetSubmissionPreview.mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>A</p>' });

    const { render, latest, root } = probe();
    await render('token-a', statusFor('sky-dodge', 'sha-a'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest().rawHtml).toBe('<p>A</p>');

    // Switching to a different game's token — with `status` not caught up yet, exactly
    // as it arrives from CreatorStudioView on the render where `stageToken` first
    // flips — must clear the previous game's html on this exact render, not one render
    // later once some effect catches up. The concrete failure mode this guards: a
    // freshly key-remounted `StudioStage` seeding its very first `shownHtml` from this
    // value.
    await render('token-b', null);
    expect(latest().rawHtml).toBeNull();
    expect(latest().origin.kind).toBe('none');

    root.unmount();
  });

  it('re-fetches and shows the channel build once a staged assembly lands after the loaded preview (CE-12)', async () => {
    // The exact shape CE-12 fixes: a game that has already delivered (so a gate-built
    // preview loads first, same as every game an owner would actually want to
    // hand-edit), then a staging write (owner or agent) lands a fresher channel build.
    // Before the fix, `if (preview || !latest) return;` disabled this effect for the
    // rest of the session the instant the preview above loaded — the stage would never
    // refresh again for this round.
    mockedGetSubmissionPreview.mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>gate-built</p>' });
    mockedGetChannelPlayable.mockResolvedValue('<p>owner-staged</p>');

    const { render, latest, root } = probe();
    const base = statusFor('sky-dodge', 'sha-a');
    await render('token-a', base);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest().rawHtml).toBe('<p>gate-built</p>');
    expect(mockedGetChannelPlayable).not.toHaveBeenCalled();

    const staged: SubmissionStatus = {
      ...base,
      playable: [{ ref: 'p1', createdAt: new Date(Date.now() + 60_000).toISOString() }],
    };
    await render('token-a', staged);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedGetChannelPlayable).toHaveBeenCalledTimes(1);
    expect(latest().rawHtml).toBe('<p>owner-staged</p>');
    expect(latest().origin.kind).toBe('staged');

    root.unmount();
  });

  it('keeps showing the loaded preview when the newest playable is not actually newer', async () => {
    // A channel item that predates (or has no timestamp relative to) the loaded
    // preview must not flip the display to a stale document — the freshness check
    // has to be a real comparison, not "any playable item wins".
    mockedGetSubmissionPreview.mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>gate-built</p>' });
    mockedGetChannelPlayable.mockResolvedValue('<p>stale channel</p>');

    const { render, latest, root } = probe();
    const base = statusFor('sky-dodge', 'sha-a');
    await render('token-a', base);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest().rawHtml).toBe('<p>gate-built</p>');

    // A playable item older than the preview that already loaded — must not trigger a
    // fetch, and must not be shown even if it somehow were fetched (regression guard
    // on the freshness comparison itself, not just the effect's early return).
    const olderPlayable: SubmissionStatus = {
      ...base,
      playable: [{ ref: 'p0', createdAt: new Date(Date.now() - 60_000).toISOString() }],
    };
    await render('token-a', olderPlayable);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedGetChannelPlayable).not.toHaveBeenCalled();
    expect(latest().rawHtml).toBe('<p>gate-built</p>');

    root.unmount();
  });

  it('Track 2: pushPreview shows a synchronous build immediately, no fetch', async () => {
    mockedGetSubmissionPreview.mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>gate-built</p>' });

    const { render, latest, root } = probe();
    await render('token-a', statusFor('sky-dodge', 'sha-a'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest().rawHtml).toBe('<p>gate-built</p>');

    await act(async () => {
      latest().pushPreview('<p>synchronous</p>');
    });

    expect(latest().rawHtml).toBe('<p>synchronous</p>');
    expect(latest().origin.kind).toBe('staged');
    root.unmount();
  });

  it('fetches and displays a specific historical version when selectedPreviewVersion is given', async () => {
    mockedGetSubmissionPreview.mockImplementation(async (_token, version) => {
      if (version === 'v-old') {
        return { slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>historical-version-old</p>' };
      }
      return { slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>current-preview</p>' };
    });

    const { render, latest, root } = probe();
    const base = statusFor('sky-dodge', 'sha-a');
    await render('token-a', base, { selectedPreviewVersion: 'v-old' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedGetSubmissionPreview).toHaveBeenCalledWith('token-a', 'v-old');
    expect(latest().rawHtml).toBe('<p>historical-version-old</p>');
    expect(latest().origin).toMatchObject({ kind: 'staged', versionLabel: 'v-old' });
    root.unmount();
  });

  it('falls back to the last published build while a new round has not delivered anything yet', async () => {
    mockedFetchPublishedGame.mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>live</p>' });

    const { render, latest, root } = probe();
    await render('token-a', { status: 'dispatched', slug: 'sky-dodge' } as unknown as SubmissionStatus);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedFetchPublishedGame).toHaveBeenCalledWith('sky-dodge');
    expect(latest().rawHtml).toBe('<p>live</p>');
    expect(latest().origin.kind).toBe('delivered');

    root.unmount();
  });

  it('refetches the published document once the round that used it as a fallback itself publishes', async () => {
    mockedFetchPublishedGame.mockResolvedValueOnce({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>pre-round</p>' });

    const { render, latest, root } = probe();
    await render('token-a', { status: 'dispatched', slug: 'sky-dodge' } as unknown as SubmissionStatus);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest().rawHtml).toBe('<p>pre-round</p>');

    mockedFetchPublishedGame.mockResolvedValueOnce({
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      html: '<p>just-published</p>',
    });
    await render('token-a', { status: 'published', slug: 'sky-dodge' } as unknown as SubmissionStatus);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedFetchPublishedGame).toHaveBeenCalledTimes(2);
    expect(latest().rawHtml).toBe('<p>just-published</p>');

    root.unmount();
  });
});
