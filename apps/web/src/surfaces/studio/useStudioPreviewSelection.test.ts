// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SubmissionStatus } from '../../submissionApi.js';
import { useStageSource } from '../../useStageSource.js';
import { useStudioPreviewSelection } from './useStudioPreviewSelection.js';

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return {
    ...actual,
    getSubmissionPreview: vi.fn(async (_token: string, version?: string) => ({
      slug: 'game',
      title: 'Game',
      html: `<p>${version}</p>`,
    })),
  };
});

const unmounts: Array<() => void> = [];
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => {
    while (unmounts.length) unmounts.pop()!();
  });
  document.body.innerHTML = '';
});

function status(version: string, verdict: 'pending' | 'green' | 'red'): SubmissionStatus {
  return {
    status: 'building',
    phase: 'building',
    stall: 'ended',
    preview: { slug: 'game' },
    progress: { headSha: version, commits: [], checklist: [], revisions: [] },
    recentBuilds: [
      { version, mode: 'preview', verdict, createdAt: '2026-10-17T20:37:00Z' },
      { version: 'old', mode: 'preview', verdict: 'green', createdAt: '2026-10-17T20:27:00Z' },
    ],
  };
}

function probe() {
  let latest!: {
    selected: string | null;
    select: (version: string | null) => void;
    source: ReturnType<typeof useStageSource>;
  };
  function Probe({ token, status }: { token: string; status: SubmissionStatus }) {
    const [selected, select] = useStudioPreviewSelection(token, status);
    const source = useStageSource(token, status, { selectedPreviewVersion: selected });
    latest = { selected, select, source };
    return null;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  unmounts.push(() => root.unmount());
  return {
    latest: () => latest,
    render: async (status: SubmissionStatus, token = 'token') => {
      await act(async () => {
        root.render(createElement(Probe, { token, status }));
      });
    },
    select: async (version: string | null) => {
      await act(async () => latest.select(version));
    },
  };
}

it('switches from the selected old build to the new build when it passes', async () => {
  const view = probe();
  await view.render(status('new', 'pending'));
  await view.select('old');
  expect(view.latest().source.origin.version).toBe('old');
  await view.render(status('new', 'pending'));
  expect(view.latest().selected).toBe('old');

  await view.render(status('new', 'green'));
  expect(view.latest().selected).toBeNull();
  expect(view.latest().source.origin.version).toBe('new');
  expect(view.latest().source.rawHtml).toBe('<p>new</p>');

  await view.select('old');
  await view.render(status('new', 'green'));
  expect(view.latest().selected).toBe('old');
  expect(view.latest().source.origin.version).toBe('old');
});

it('preserves historical selection after a failed build and resets it on a game switch', async () => {
  const view = probe();
  await view.render(status('new', 'pending'));
  await view.select('old');
  await view.render(status('new', 'red'));
  expect(view.latest().selected).toBe('old');
  expect(view.latest().source.origin.version).toBe('old');

  await view.render(status('other', 'green'), 'other-token');
  expect(view.latest().selected).toBeNull();
  expect(view.latest().source.origin.version).toBe('other');
});
