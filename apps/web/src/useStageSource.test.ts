// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStageSource } from './useStageSource.js';
import { getSubmissionPreview } from './submissionApi.js';
import type { SubmissionStatus } from './submissionApi.js';

vi.mock('./submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return { ...actual, getSubmissionPreview: vi.fn(), getChannelPlayable: vi.fn() };
});

const mockedGetSubmissionPreview = vi.mocked(getSubmissionPreview);

function statusFor(slug: string, headSha: string): SubmissionStatus {
  return {
    status: 'building',
    preview: { slug },
    progress: { headSha, commits: [], checklist: [] },
  };
}

/** Renders the hook and reports what it returned on the most recent settled render. */
function probe() {
  let latest: ReturnType<typeof useStageSource> | null = null;
  function Probe(props: { token: string; status: SubmissionStatus | null }) {
    latest = useStageSource(props.token, props.status);
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    render: async (token: string, status: SubmissionStatus | null) => {
      await act(async () => {
        root.render(createElement(Probe, { token, status }));
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
});
