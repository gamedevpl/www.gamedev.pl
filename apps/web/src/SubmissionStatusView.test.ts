// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { ACTIVE_POLL_MS, SubmissionStatusView } from './SubmissionStatusView.js';
import {
  abandonSubmission,
  getChannelPlayable,
  getSubmissionPreview,
  getSubmissionStatus,
  submitFeedback,
} from './submissionApi.js';

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi')>('./submissionApi');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
    getSubmissionPreview: vi.fn(),
    getChannelPlayable: vi.fn(),
    submitFeedback: vi.fn(),
    abandonSubmission: vi.fn(),
  };
});

const mockedGetSubmissionStatus = vi.mocked(getSubmissionStatus);
const mockedGetSubmissionPreview = vi.mocked(getSubmissionPreview);
const mockedGetChannelPlayable = vi.mocked(getChannelPlayable);
const mockedSubmitFeedback = vi.mocked(submitFeedback);
const mockedAbandonSubmission = vi.mocked(abandonSubmission);

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SubmissionStatusView', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.clearAllMocks();
  });

  it('renders queued state copy', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'queued' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/queued-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'queued-token' }));
      await flushEffects();
    });

    expect(container.textContent).toContain('In the queue');

    await act(async () => {
      root.unmount();
    });
  });

  it('offers the latest channel build via Play the draft → theater, before any commit exists', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // Still queued: no pull request, no commit, no committed capture. This is the
    // ten-minute stretch a watcher fills, and the whole reason the route exists.
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'queued',
      playable: [
        {
          ref: 'newest',
          slug: 'puppy-stroll',
          label: 'You can walk the puppy now.',
          createdAt: new Date().toISOString(),
        },
        { ref: 'older', slug: 'puppy-stroll', createdAt: new Date(Date.now() - 120_000).toISOString() },
      ],
    });
    // Fetched as text so the theater can inject the player bridge (Escape / sound).
    mockedGetChannelPlayable.mockResolvedValue('<!doctype html><canvas></canvas>');
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/playable-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'playable-token' }));
      await flushEffects();
      await flushEffects();
    });

    // Same surface as the PR draft: a PlayCard, nothing embedded inline.
    // #322 dropped the inline frame from this view; the pointer-lock sandbox this
    // branch adds is still asserted where a frame is actually rendered — see the
    // preview cases below and GameFrame.sandbox.test.ts.
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('You can walk the puppy now.');
    // Newest wins: an older build is history, not the thing to play.
    expect(mockedGetChannelPlayable).toHaveBeenCalledWith('playable-token', expect.objectContaining({ ref: 'newest' }));
    const playDraft = container.querySelector<HTMLButtonElement>('.status-play-cta');
    expect(playDraft?.textContent).toContain('Play the draft');

    await act(async () => {
      playDraft?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    const frame = container.querySelector('iframe[title="puppy-stroll"]') as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    // srcdoc + bridge — same path as a PR draft, so theater chrome actually works.
    expect(frame?.getAttribute('srcdoc') ?? '').toContain('gdpl-player');
    // The theater frame is a GameFrame, so it carries the pointer-lock sandbox this
    // branch adds. Additive only — still no allow-same-origin, still opaque origin.
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');

    await act(async () => {
      root.unmount();
    });
  });

  it('does not show a preview error when a channel draft loaded but the PR preview failed', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // The Studio screenshot case: open PR (so we try the branch assemble) + a
    // channel playable that already works. GitHub 502s the PR path; the channel
    // path succeeds. Creators must not see a red banner under a live Play card.
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      preview: { slug: 'jump-rope-rhythm' },
      progress: { headSha: 'sha-stuck', commits: [], checklist: [] },
      playable: [
        {
          ref: 'channel-1',
          slug: 'rope-jumper',
          label: 'You can already play — draft version',
          createdAt: new Date().toISOString(),
        },
      ],
    });
    mockedGetSubmissionPreview.mockRejectedValue(Object.assign(new Error('failed to load preview'), { status: 502 }));
    mockedGetChannelPlayable.mockResolvedValue('<!doctype html><canvas></canvas>');
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/dual-preview-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'dual-preview-token' }));
      await flushEffects();
      await flushEffects();
      await flushEffects();
    });

    expect(mockedGetChannelPlayable).toHaveBeenCalled();
    expect(container.querySelector('.status-play-cta')).not.toBeNull();
    expect(container.textContent).not.toContain("We couldn't load the preview right now");
    expect(container.querySelector('p.error')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('shows agent channel updates while the build is still queued, with translated step labels', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // No PR yet — so no `progress` at all. This is exactly the stretch where the
    // page used to have nothing to show, and where creators gave up.
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'queued',
      events: [
        {
          id: 'e2',
          kind: 'step',
          step: 'art',
          text: 'Rysuję żołnierzy.',
          createdAt: new Date(Date.now() - 30_000).toISOString(),
        },
        {
          id: 'e1',
          kind: 'step',
          step: 'planning',
          text: 'Planuję misje.',
          createdAt: new Date(Date.now() - 120_000).toISOString(),
        },
      ],
    });
    await i18n.changeLanguage('pl');
    window.history.pushState(null, '', '/status/events-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'events-token' }));
      await flushEffects();
    });

    // The newest update is the headline; both appear in the feed.
    expect(container.textContent).toContain('Rysuję żołnierzy.');
    expect(container.textContent).toContain('Planuję misje.');
    // The step comes from our own Polish copy, not from machine translation.
    expect(container.textContent).toContain('Rysowanie');
    expect(container.textContent).toContain('Planowanie');

    await act(async () => {
      root.unmount();
    });
    await i18n.changeLanguage('en');
  });

  it('lets the creator steer the build before any playable draft exists', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // Building, no PR, so no preview. The feedback box used to wait for a preview,
    // which stranded the creator through the exact stretch where a course correction
    // costs the least.
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'building' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/steer-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'steer-token' }));
      await flushEffects();
    });

    expect(container.querySelector('.status-feedback-input')).not.toBeNull();
    // The in-build wording, not the "played it and something's off" wording.
    expect(container.textContent).toContain('Want to steer it?');
    expect(container.textContent).not.toContain('Played it and');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the submitted prompt and a ticking elapsed timer while the build is running', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'building' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/elapsed-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(SubmissionStatusView, {
          token: 'elapsed-token',
          submittedTitle: 'Circus Cat',
          submittedConcept: 'A black cat dodging hula hoops',
          submittedAt: Date.now() - 134_000,
        }),
      );
      await flushEffects();
    });

    // The prompt the player typed is echoed back, so they can see what they asked for.
    expect(container.textContent).toContain('A black cat dodging hula hoops');
    // 134s -> "2m 14s", proving the duration formatting and that the timer is mounted.
    expect(container.textContent).toContain('2m 14s');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders needs changes state copy', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'needs_changes' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/needs-changes');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'needs-changes' }));
      await flushEffects();
    });

    expect(container.textContent).toContain('Needs a tweak');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders the published play flow served by the app API', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'published',
      slug: 'sky-dodge',
    });
    // PublishedGameFrame fetches the assembled game from GET /api/games/:slug.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<canvas>published</canvas>' })),
      );
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/published-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'published-token', submittedTitle: 'Sky Dodge' }));
      await flushEffects();
    });

    expect(container.textContent).toContain('Live!');

    // The status page never embeds the game inline — it launches the full-viewport
    // theater on click (no scroll trap, no duplicated in-game chrome).
    const playButton = container.querySelector<HTMLButtonElement>('.status-play-cta');
    expect(playButton?.textContent).toContain('Play your game');
    expect(container.querySelector('iframe')).toBeNull();

    await act(async () => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/games/sky-dodge');
    const iframe = container.querySelector('iframe[title="Sky Dodge"]');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
    // Runs via srcDoc (no external origin), wrapped with the embed bridge in the
    // player — so the original document is contained, not exact.
    const srcdoc = iframe?.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('<canvas>published</canvas>');
    expect(srcdoc).toContain('gdpl-player');

    fetchSpy.mockRestore();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders the build progress checklist and commit log, and auto-loads the preview without a click', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      preview: { slug: 'space-runner' },
      progress: {
        headSha: 'sha-1',
        commits: [{ message: 'Scaffold the game', committedDate: '2026-01-01T00:00:00Z' }],
        checklist: [
          { text: 'Scaffold index.html and game.js', checked: true },
          { text: 'Add collision detection', checked: false },
        ],
      },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/building-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'building-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.textContent).toContain('Scaffold index.html and game.js');
    expect(container.textContent).toContain('Add collision detection');
    expect(container.textContent).toContain('Scaffold the game');

    // The preview auto-loads once available (no manual "preview" click), surfacing a
    // "play the draft" card — but nothing is embedded inline until the user launches it.
    expect(mockedGetSubmissionPreview).toHaveBeenCalledWith('building-token');
    expect(container.textContent).toContain('Space Runner');
    const playDraft = container.querySelector<HTMLButtonElement>('.status-play-cta');
    expect(playDraft?.textContent).toContain('Play the draft');
    expect(container.querySelector('iframe')).toBeNull();

    // Launching opens the game in the full-viewport theater.
    await act(async () => {
      playDraft?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    const iframe = container.querySelector('iframe[title="Space Runner"]');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
    expect(iframe?.getAttribute('srcdoc') ?? '').toContain('gdpl-player');

    await act(async () => {
      root.unmount();
    });
  });

  it('refreshes the live preview only when the agent pushes a new commit (headSha changes)', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    try {
      let currentSha = 'sha-1';
      mockedGetSubmissionStatus.mockImplementation(async () => ({
        status: 'building',
        preview: { slug: 'space-runner' },
        progress: { headSha: currentSha, commits: [], checklist: [] },
      }));
      mockedGetSubmissionPreview.mockImplementation(async () => ({
        slug: 'space-runner',
        title: 'Space Runner',
        html: `<canvas>${currentSha}</canvas>`,
      }));
      await i18n.changeLanguage('en');
      window.history.pushState(null, '', '/status/refresh-token');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'refresh-token' }));
        await flushEffects();
        await flushEffects();
      });

      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(1);
      // Nothing is embedded inline — the draft plays in the theater on demand.
      expect(container.querySelector('iframe')).toBeNull();

      // A status poll fires (still headSha "sha-1") — must NOT re-fetch the preview.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
      });
      expect(mockedGetSubmissionStatus).toHaveBeenCalledTimes(2);
      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(1);

      // The agent pushes a new commit — the next poll picks up a new headSha, which
      // must trigger a silent preview refresh (no click needed).
      currentSha = 'sha-2';
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
      });

      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(2);

      // Launching the draft now plays the newest build (sha-2), snapshotted at click.
      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('.status-play-cta')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(container.querySelector('iframe')?.getAttribute('srcdoc') ?? '').toContain('<canvas>sha-2</canvas>');

      await act(async () => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps keyboard focus in the game while the build keeps polling', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    try {
      // A fresh object per poll, like the real API — so each poll actually re-renders
      // the view (and hands the theater a new onExit closure), which is the condition
      // that used to steal focus.
      mockedGetSubmissionStatus.mockImplementation(async () => ({
        status: 'building',
        preview: { slug: 'space-runner' },
        progress: { headSha: 'sha-1', commits: [], checklist: [] },
      }));
      mockedGetSubmissionPreview.mockResolvedValue({
        slug: 'space-runner',
        title: 'Space Runner',
        html: '<canvas></canvas>',
      });
      await i18n.changeLanguage('en');
      window.history.pushState(null, '', '/status/focus-token');

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'focus-token' }));
        await flushEffects();
        await flushEffects();
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('.status-play-cta')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });

      // GameFrame hands focus to the iframe shortly after the theater mounts.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      const iframe = container.querySelector('iframe[title="Space Runner"]');
      expect(document.activeElement).toBe(iframe);

      // A WIP draft keeps polling every few seconds, re-rendering the status view and
      // handing the theater a fresh onExit closure. That must not pull focus back onto
      // the chrome (the exit button, or the play button underneath) mid-game.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
      });
      expect(document.activeElement).toBe(iframe);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
      });
      expect(document.activeElement).toBe(iframe);

      // Escape still exits. While playing, the key never reaches the app's own
      // listener — it goes to the focused game iframe, which relays it over the
      // bridge — so that's the path exercised here.
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'null',
            data: { source: 'gdpl-player', type: 'key', key: 'Escape' },
          }),
        );
        await flushEffects();
      });
      expect(container.querySelector('iframe')).toBeNull();

      // And the app-side listener still covers Escape pressed on the player chrome.
      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('.status-play-cta')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(container.querySelector('iframe')).not.toBeNull();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flushEffects();
      });
      expect(container.querySelector('iframe')).toBeNull();

      await act(async () => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('relays post-play feedback to the build agent', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    mockedSubmitFeedback.mockResolvedValue({ ok: true, target: 'pull_request' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/feedback-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'feedback-token' }));
      await flushEffects();
      await flushEffects();
    });

    // The feedback panel is offered once a draft is playable.
    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    expect(textarea).not.toBeNull();
    const sendButton = container.querySelector<HTMLButtonElement>('.status-feedback .primary-btn');
    // Empty / too-short feedback keeps the button disabled.
    expect(sendButton?.disabled).toBe(true);

    await act(async () => {
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, 'Please make the car faster and add a boost pad.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await flushEffects();
    });

    expect(sendButton?.disabled).toBe(false);

    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(mockedSubmitFeedback).toHaveBeenCalledWith(
      'feedback-token',
      'Please make the car faster and add a boost pad.',
    );
    expect(container.querySelector('.status-feedback-sent')).not.toBeNull();

    // The request lands in the activity feed immediately — waiting for it to
    // round-trip through GitHub is what made sent feedback feel like it vanished.
    const echoed = container.querySelector('.build-activity-revision');
    expect(echoed?.textContent).toContain('Please make the car faster and add a boost pad.');
    expect(echoed?.textContent).toContain('Your request');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the creator’s earlier change requests interleaved with the agent’s commits', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      preview: { slug: 'space-runner' },
      progress: {
        headSha: 'sha-1',
        commits: [{ message: 'Speed up the car', committedDate: '2026-01-01T00:20:00Z' }],
        checklist: [],
        revisions: [{ text: 'Make the car faster please.', createdAt: '2026-01-01T00:10:00Z' }],
      },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/revisions-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'revisions-token' }));
      await flushEffects();
      await flushEffects();
    });

    const entries = [...container.querySelectorAll('.build-activity-item')].map((node) => node.textContent ?? '');
    expect(entries).toHaveLength(2);
    // Newest first: the commit that answered the request sits above the request.
    expect(entries[0]).toContain('Speed up the car');
    expect(entries[1]).toContain('Make the car faster please.');
    expect(container.querySelectorAll('.build-activity-revision')).toHaveLength(1);

    await act(async () => {
      root.unmount();
    });
  });
});

describe('SubmissionStatusView expectations & failures', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.clearAllMocks();
  });

  it('shows the agent’s own progress line above anything it infers', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      progress: {
        headSha: 'sha-1',
        commits: [],
        checklist: [{ text: 'Add collision detection', checked: false }],
        note: 'Adding grenades to the soldiers.',
      },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'note-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.build-progress-note')?.textContent).toContain('Adding grenades to the soldiers.');
    // The inferred "working on: <first unfinished task>" line stands down when the
    // agent has said what it is doing.
    expect(container.querySelector('.build-progress-current')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('says so when CI is failing on the build', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      progress: { headSha: 'sha-1', commits: [], checklist: [], checks: 'FAILURE' },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'failing-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-warning')?.textContent).toContain('Automatic checks are failing');

    await act(async () => {
      root.unmount();
    });
  });
});

describe('SubmissionStatusView stop & retry', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.pushState(null, '', '/');
    vi.clearAllMocks();
  });

  it('requires a second click before stopping a build', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'building' });
    mockedAbandonSubmission.mockResolvedValue(undefined);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'stop-token' }));
      await flushEffects();
      await flushEffects();
    });

    const arm = container.querySelector<HTMLButtonElement>('.status-abandon');
    expect(arm?.textContent).toContain('Stop this build');

    // Arming must not call the API — this is the mis-tap guard.
    await act(async () => {
      arm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(mockedAbandonSubmission).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Stop building this game?');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.status-abandon.is-danger')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });
    expect(mockedAbandonSubmission).toHaveBeenCalledWith('stop-token');

    await act(async () => {
      root.unmount();
    });
  });

  it('offers no stop control once the build is finished, and hands a stopped idea back for retry', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'abandoned' });
    const onRetry = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(SubmissionStatusView, {
          token: 'stopped-token',
          submittedConcept: 'a squad game like cannon fodder',
          onRetry,
        }),
      );
      await flushEffects();
      await flushEffects();
    });

    expect(container.textContent).toContain('Stopped');
    expect(container.querySelector('.status-abandon')).toBeNull();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.status-retry')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    // Prefill, not resubmit: the creator edits the idea that just failed.
    expect(onRetry).toHaveBeenCalledWith('a squad game like cannon fodder');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows pictures of the build, newest first, before any commit exists', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // Still queued: no PR, no preview, nothing committed. The only pictures that can
    // exist at this point are ones the agent pushed straight down the channel.
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'queued',
      media: [
        { source: 'channel', ref: 'shot-2', label: 'The bridge holds', createdAt: new Date().toISOString() },
        { source: 'channel', ref: 'shot-1', createdAt: new Date(Date.now() - 60_000).toISOString() },
      ],
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/media-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'media-token' }));
      await flushEffects();
    });

    // Thumbnails live on the timeline, not as a banner above it.
    const shots = container.querySelectorAll('.build-activity-shot img');
    expect(shots).toHaveLength(2);
    expect(shots[0]!.getAttribute('src')).toContain('/api/submissions/media-token/shot/shot-2');
    // The agent's own caption is what the creator reads, not a generic placeholder.
    expect(container.textContent).toContain('The bridge holds');
    expect(container.querySelector('.status-lightbox')).toBeNull();

    // Clicking one opens it full size; Escape closes it again.
    await act(async () => {
      (container.querySelector('.build-activity-shot') as HTMLButtonElement).click();
    });
    const lightbox = container.querySelector('.status-lightbox-image') as HTMLImageElement | null;
    expect(lightbox).not.toBeNull();
    expect(lightbox!.getAttribute('src')).toContain('/api/submissions/media-token/shot/shot-2');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('.status-lightbox')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
