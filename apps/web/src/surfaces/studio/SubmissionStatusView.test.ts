// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { statusPath } from '../../core/router.js';
import { SubmissionStatusView } from './SubmissionStatusView.js';
import { ACTIVE_POLL_MS, pollDelayMs } from './studioStatusPoll.js';
import { HANDOFF_STALE_MS } from './StudioConnectCard.js';
import {
  abandonSubmission,
  getChannelPlayable,
  getSubmissionPreview,
  getSubmissionStatus,
  handoffToPlatform,
  handoffToSelf,
  submitFeedback,
} from '../../submissionApi.js';
import { submitImprovement } from '../../studioApi.js';
import { recordStudioStep } from '../../visitTelemetry.js';

vi.mock('../../visitTelemetry', async () => {
  const actual = await vi.importActual<typeof import('../../visitTelemetry')>('../../visitTelemetry');
  return { ...actual, recordStudioStep: vi.fn() };
});

vi.mock('../../studioApi', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi')>('../../studioApi');
  return { ...actual, submitImprovement: vi.fn() };
});

vi.mock('../../submissionApi', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi')>('../../submissionApi');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
    getSubmissionPreview: vi.fn(),
    getChannelPlayable: vi.fn(),
    handoffToPlatform: vi.fn(),
    handoffToSelf: vi.fn(),
    submitFeedback: vi.fn(),
    abandonSubmission: vi.fn(),
  };
});

const mockedGetSubmissionStatus = vi.mocked(getSubmissionStatus);
const mockedGetSubmissionPreview = vi.mocked(getSubmissionPreview);
const mockedGetChannelPlayable = vi.mocked(getChannelPlayable);
const mockedHandoffToPlatform = vi.mocked(handoffToPlatform);
const mockedHandoffToSelf = vi.mocked(handoffToSelf);
const mockedSubmitFeedback = vi.mocked(submitFeedback);
const mockedAbandonSubmission = vi.mocked(abandonSubmission);
const mockedSubmitImprovement = vi.mocked(submitImprovement);
const mockedRecordStudioStep = vi.mocked(recordStudioStep);

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

// How many times a sentence is on screen.
function countText(container: HTMLElement, needle: string): number {
  return (container.textContent ?? '').split(needle).length - 1;
}

describe('pollDelayMs', () => {
  it('polls tightly while the platform agent session is still starting', () => {
    // Public status stays `queued` for phase `dispatched`; idle polling would hide
    // the flip to `building` when GitHub reports `in_progress`.
    expect(pollDelayMs('queued', undefined, 'dispatched')).toBe(ACTIVE_POLL_MS);
    expect(pollDelayMs('queued')).toBeGreaterThan(ACTIVE_POLL_MS);
  });

  it('polls gently once gate-green is waiting on a human', () => {
    expect(pollDelayMs('in_review')).toBeGreaterThan(ACTIVE_POLL_MS);
  });

  it('polls tightly while a self agent is ended or quiet so resume shows quickly', () => {
    // Ended/quiet used idle 10s; start already ran before Studio left "stopped".
    expect(pollDelayMs('in_review', 'ended')).toBe(ACTIVE_POLL_MS);
    expect(pollDelayMs('building', 'quiet')).toBe(ACTIVE_POLL_MS);
    expect(pollDelayMs('queued', 'no_agent_yet')).toBe(ACTIVE_POLL_MS);
  });
});

describe('SubmissionStatusView', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.clearAllMocks();
    vi.useRealTimers();
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

  it('keeps Play out of the embedded foot — the Studio header owns that verb', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      playable: [{ ref: 'newest', slug: 'puppy-stroll', createdAt: new Date().toISOString() }],
    });
    mockedGetChannelPlayable.mockResolvedValue('<!doctype html><canvas></canvas>');
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/playtest-token');

    const onPlaytest = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'playtest-token', embedded: true, onPlaytest }));
      await flushEffects();
      await flushEffects();
    });

    // Thread foot is phase/heartbeat only — no Play peer of the composer.
    expect(container.querySelector('.status-play-cta')).toBeNull();
    expect(container.querySelector('.status-playtest-cta')).toBeNull();
    expect(container.querySelector('.studio-context-progress')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('leaves the playtest call to action out when there is no playtest surface to open', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      playable: [{ ref: 'newest', slug: 'puppy-stroll', createdAt: new Date().toISOString() }],
    });
    mockedGetChannelPlayable.mockResolvedValue('<!doctype html><canvas></canvas>');
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/standalone-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // Standalone (a legacy /status link), where the studio's playtest surface is not
    // on screen to switch to.
    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'standalone-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-play-cta')).not.toBeNull();
    expect(container.querySelector('.status-playtest-cta')).toBeNull();

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
      progress: { headSha: 'sha-stuck', commits: [], checklist: [], revisions: [] },
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

  it('shows the submitted prompt, and beats from the agent’s last update rather than from submission', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      events: [
        {
          id: 'evt-1',
          kind: 'step',
          text: 'Blocking out the arena',
          createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
        },
      ],
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/heartbeat-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(SubmissionStatusView, {
          token: 'heartbeat-token',
          submittedTitle: 'Circus Cat',
          submittedConcept: 'A black cat dodging hula hoops',
        }),
      );
      await flushEffects();
    });

    // The prompt the player typed is echoed back, so they can see what they asked for.
    expect(container.textContent).toContain('A black cat dodging hula hoops');
    // The pill measures the build's pulse, not its age: a stopwatch from submission
    // said "in progress for 8h" on a build that had finished and was waiting on us.
    expect(container.querySelector('.status-heartbeat')?.textContent).toContain('4 minutes ago');

    await act(async () => {
      root.unmount();
    });
  });

  it('has no heartbeat to show before the agent has done anything', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'queued' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/silent-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'silent-token' }));
      await flushEffects();
    });

    // "Live" alone, with nothing after it — better than inventing a duration for a
    // build that has not reported anything yet.
    expect(container.querySelector('.status-live')).not.toBeNull();
    expect(container.querySelector('.status-heartbeat')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('describes a delivered build waiting to go live, instead of claiming checks are running', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'in_review', phase: 'ready_for_review' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/delivered-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'delivered-token' }));
      await flushEffects();
    });

    const description = container.querySelector('.status-description')?.textContent ?? '';
    expect(description).toContain('waiting for the last look');
    expect(description).not.toContain('Automated checks are making sure');
    expect(container.querySelector('.studio-context-phase-spinner')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('describes a remix draft as a private save, not as waiting to go live', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'in_review',
      phase: 'ready_for_review',
      draftOrigin: 'remix',
      slug: 'remix-of-dog-dash',
      preview: { slug: 'remix-of-dog-dash' },
      progress: { headSha: 'v1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'remix-of-dog-dash',
      title: 'Remix of Dog Dash',
      html: '<!doctype html><canvas id="game"></canvas>',
    });
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'remix-draft-token', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.textContent).toContain('private draft');
    expect(container.textContent).not.toContain('waiting for the last look');
    expect(container.textContent).not.toContain('passed every check');
    expect(container.querySelector('.studio-context-phase')?.textContent).toMatch(/Your remix/i);
    expect(container.querySelector('.studio-context-phase')?.textContent).not.toMatch(/Final check/i);

    await act(async () => {
      root.unmount();
    });
  });

  it('loads Studio preview for a self-build ready_for_review job with no channel playable', async () => {
    // BY-14c: self deliveries land in the games store; status advertises preview.slug
    // (no playable[]). The embedded thread must still fetch /preview and offer Play.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'in_review',
      phase: 'ready_for_review',
      builder: 'self',
      // Stale quiet can linger after gate-green — must not resurface as a stall chip.
      stall: 'quiet',
      slug: 'studio-play',
      preview: { slug: 'studio-play' },
      progress: { headSha: 'v1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'studio-play',
      title: 'Studio Play',
      html: '<!doctype html><canvas id="game"></canvas>',
    });
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'self-ready-token', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(mockedGetSubmissionPreview).toHaveBeenCalledWith('self-ready-token');
    expect(mockedGetChannelPlayable).not.toHaveBeenCalled();
    // Embedded foot no longer carries Play — open the draft from a thread media/version
    // path is covered elsewhere; here we only assert the preview loaded for Studio.
    expect(container.querySelector('.studio-thread-context .status-play-cta')).toBeNull();
    expect(mockedGetSubmissionPreview.mock.results[0]?.value).toBeTruthy();
    // Gate-green is Done — do not mount connect (endpoint is inactive_round and used
    // to render a red "could not load connect steps" over a finished delivery).
    expect(container.querySelector('.studio-connect')).toBeNull();
    expect(container.textContent).not.toContain('Continue with your agent');
    expect(container.textContent).not.toMatch(/could not load the connect steps/i);
    expect(container.querySelector('.status-feedback-route')).toBeNull();
    expect(container.querySelector('.studio-status-chip')).toBeNull();
    expect(container.textContent).not.toMatch(/quiet for a while|can't start it from here/i);
    expect(container.querySelector('.studio-context-phase')?.textContent).toMatch(/Final check/i);
    // Gate-green is waiting on a human — not mid-agent work. A spinner here made
    // "Final check · updated 20 minutes ago" look eternally in progress.
    expect(container.querySelector('.studio-thread-context.is-active')).toBeNull();
    expect(container.querySelector('.studio-context-phase-spinner')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('falls back to the coarse status copy for a phase with nothing of its own to say', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'building', phase: 'building' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/building-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'building-token' }));
      await flushEffects();
    });

    // No `phases.building` key exists — the status sentence must show through rather
    // than the raw key leaking onto the page.
    const description = container.querySelector('.status-description')?.textContent ?? '';
    expect(description).toContain('An agent is coding your game right now');
    expect(description).not.toContain('statusView.');

    await act(async () => {
      root.unmount();
    });
  });

  // `describe('the live draft card', ...)` is gone along with `StudioLivePreview.tsx` —
  // the stage in the game-first layout is the live preview now, at full size, not a
  // 190px card floating over the thread's composer. See
  // docs/studio-game-first-implementation-plan.md, "What is deleted".

  it('offers the same one box on a published game, and sends it somewhere else', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'published', slug: 'tv-tycoon' });
    mockedSubmitImprovement.mockResolvedValue({ ok: true, jobId: 5, token: 'improve-token', slug: 'tv-tycoon' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/live-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'live-token', embedded: true }));
      await flushEffects();
    });

    // A published game used to have no composer here at all — asking for a change meant
    // knowing to go to a different tab, which meant knowing the game's lifecycle state.
    const box = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    expect(box).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(box, 'The second level is far too hard, please add a checkpoint.');
      box!.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });
    await act(async () => {
      container
        .querySelector('.status-feedback .primary-btn')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    // Routed from the state the server reported, not from a mode the creator picked.
    // Published starts a new round, so the sticky builder travels with the request
    // (default: platform — the Gamedev.pl coding agent). Choice tiles stay in Change.
    expect(mockedSubmitImprovement).toHaveBeenCalledWith(
      'live-token',
      'The second level is far too hard, please add a checkpoint.',
      undefined,
      'platform',
    );
    expect(mockedSubmitFeedback).not.toHaveBeenCalled();
    expect(container.querySelector('.builder-mode-selector')?.textContent).toContain('Gamedev.pl');
    expect(container.querySelector('.builder-choice')).toBeNull();

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
    expect(container.textContent).toContain('Send a short note below to continue');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the connect card while a self round awaits its agent, then hides it on signal', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.useFakeTimers();
    const connectFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        installSnippets: {
          claudeCode: 'claude mcp add gamedevpl https://example.test/api/mcp',
          codex: 'url = "https://example.test/api/mcp"',
          cursor: '{"mcpServers":{}}',
          kimi: 'npx mcp-remote https://example.test/api/mcp',
          cli: 'curl https://example.test/api/mcp',
        },
        installLinks: {
          cursor:
            'cursor://anysphere.cursor-deeplink/mcp/install?name=gamedevpl&config=' +
            btoa(JSON.stringify({ url: 'https://example.test/api/mcp' })),
          vscode: `vscode:mcp/install?${encodeURIComponent(
            JSON.stringify({ name: 'gamedevpl', type: 'http', url: 'https://example.test/api/mcp' }),
          )}`,
        },
        kickoffPrompt: 'Build "Await Game" for gamedev.pl.\nStart with the gamedevpl tool, slug: await-game',
        mcpUrl: 'https://example.test/api/mcp',
        authorizationHeader: 'Authorization: Bearer test-key-not-for-display',
        authorizationHeaderMasked: 'Authorization: Bearer ····play',
        fingerprint: 'play',
        keyGeneration: 1,
        slug: 'await-game',
        canSwitchToPlatform: true,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    }));
    vi.stubGlobal('fetch', connectFetch);

    mockedGetSubmissionStatus
      .mockResolvedValueOnce({ status: 'queued', stall: 'no_agent_yet', builder: 'self' })
      .mockResolvedValue({ status: 'building', builder: 'self', events: [] });

    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/await-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'await-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      expect(container.querySelector('.studio-connect')).not.toBeNull();
      expect(container.textContent).toContain('Connect your coding agent');
      expect(container.textContent?.toLowerCase()).not.toMatch(/\btoken\b/);
      // Tall connect UI scrolls with the transcript — pinning it in the foot crushed
      // the conversation to a sliver on a phone (connect + play CTAs + composer).
      expect(container.querySelector('.studio-thread-scroll .studio-connect')).not.toBeNull();
      expect(container.querySelector('.studio-thread-foot .studio-connect')).toBeNull();
      // Nobody is listening yet — a composer that "saves for later" is just noise beside
      // the connect steps. It returns once the agent has checked in.
      expect(container.querySelector('.status-composer')).toBeNull();
      expect(connectFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/submissions/await-token/connect'),
        expect.objectContaining({ credentials: 'include' }),
      );
      // Stall copy is replaced by the card — the card *is* the waiting state.
      expect(container.querySelector('.status-warning')).toBeNull();
      expect(container.querySelector('[data-testid="connect-switch-builder"]')?.textContent).toContain(
        'Use Gamedev.pl agent instead',
      );
      // Foot bar owns it — the card must not repeat.
      expect(countText(container, 'Waiting for your agent to check in')).toBe(1);
      expect(container.querySelector('.studio-thread-foot .studio-context-phase')?.textContent).toMatch(
        /Waiting for your agent to check in/i,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
        await flushEffects();
      });

      expect(container.querySelector('.studio-connect')).toBeNull();
      // Active self round: composer is back; the always-on "picks this up" line is gone —
      // that was chrome noise once an agent is already listening.
      expect(container.querySelector('.status-composer')).not.toBeNull();
      expect(container.querySelector('.status-feedback-route')).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('keeps one waiting sentence and a way out when the connect card is hidden', async () => {
    // Dismissed card: strip repeated the foot bar, offering only expand.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    localStorage.setItem('gamedev_connect_collapsed:hidden-token', '1');
    const connectFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        installSnippets: {
          claudeCode: 'claude mcp add gamedevpl https://example.test/api/mcp',
          codex: 'url = "https://example.test/api/mcp"',
          cursor: '{"mcpServers":{}}',
          kimi: 'npx mcp-remote https://example.test/api/mcp',
          cli: 'curl https://example.test/api/mcp',
        },
        installLinks: { cursor: 'cursor://add', vscode: 'vscode://add' },
        kickoffPrompt: 'Build "Hidden Game" for gamedev.pl.\nStart with the gamedevpl tool, slug: hidden-game',
        mcpUrl: 'https://example.test/api/mcp',
        authorizationHeader: 'Authorization: Bearer test-key-not-for-display',
        authorizationHeaderMasked: 'Authorization: Bearer ····play',
        fingerprint: 'play',
        keyGeneration: 1,
        slug: 'hidden-game',
        canSwitchToPlatform: true,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    }));
    vi.stubGlobal('fetch', connectFetch);
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'queued', stall: 'no_agent_yet', builder: 'self' });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'hidden-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      expect(container.querySelector('[data-testid="connect-collapsed"]')).not.toBeNull();
      expect(container.querySelector('.status-composer')).toBeNull();
      expect(countText(container, 'Waiting for your agent to check in')).toBe(1);
      expect(container.querySelector('.studio-thread-foot .studio-context-phase')?.textContent).toMatch(
        /Waiting for your agent to check in/i,
      );
      expect(container.querySelector('[data-testid="connect-collapsed"] .studio-connect-waiting')).toBeNull();
      // The one control that can advance a round nobody joined.
      const handoff = container.querySelector<HTMLButtonElement>(
        '[data-testid="connect-collapsed"] [data-testid="active-switch-builder"] button',
      );
      expect(handoff?.textContent).toContain('Use Gamedev.pl agent instead');

      mockedHandoffToPlatform.mockResolvedValue({});
      await act(async () => {
        handoff!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      const confirm = [
        ...container.querySelectorAll<HTMLButtonElement>('[data-testid="connect-collapsed"] button'),
      ].find((button) => button.textContent?.includes('Start Gamedev.pl agent'));
      expect(confirm).toBeDefined();
      await act(async () => {
        confirm!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(mockedHandoffToPlatform).toHaveBeenCalledWith('hidden-token', { stopActiveSelfAgent: false });
    } finally {
      await act(async () => {
        root.unmount();
      });
      vi.unstubAllGlobals();
      localStorage.clear();
    }
  });

  it('resurfaces the connect card with quiet-self copy when a self agent goes silent', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const connectFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        installSnippets: {
          claudeCode: 'claude mcp add gamedevpl https://example.test/api/mcp',
          codex: 'url = "https://example.test/api/mcp"',
          cursor: '{"mcpServers":{}}',
          kimi: 'npx mcp-remote https://example.test/api/mcp',
          cli: 'curl https://example.test/api/mcp',
        },
        installLinks: {
          cursor:
            'cursor://anysphere.cursor-deeplink/mcp/install?name=gamedevpl&config=' +
            btoa(JSON.stringify({ url: 'https://example.test/api/mcp' })),
          vscode: `vscode:mcp/install?${encodeURIComponent(
            JSON.stringify({ name: 'gamedevpl', type: 'http', url: 'https://example.test/api/mcp' }),
          )}`,
        },
        kickoffPrompt: 'Build "Quiet Game" for gamedev.pl.\nStart with the gamedevpl tool, slug: quiet-game',
        mcpUrl: 'https://example.test/api/mcp',
        authorizationHeader: 'Authorization: Bearer test-key-not-for-display',
        authorizationHeaderMasked: 'Authorization: Bearer ····play',
        fingerprint: 'play',
        keyGeneration: 1,
        slug: 'quiet-game',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    }));
    vi.stubGlobal('fetch', connectFetch);
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      stall: 'quiet',
      builder: 'self',
      events: [],
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'quiet-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      // Connect card lead covers quiet — no second amber chip under the composer.
      expect(container.querySelector('.studio-status-chip')).toBeNull();
      expect(container.querySelector('.studio-connect.is-resume')).not.toBeNull();
      expect(container.textContent).toContain('Continue with your agent');
      expect(container.textContent).not.toContain('Connect your coding agent');
      // Quiet escape hatch: Change opens the builder modal — API kills the self token
      // when platform is chosen and a note is sent. Tiles are not permanent chrome.
      expect(container.querySelector('.builder-mode-selector')?.textContent).toContain('Your agent');
      expect(container.querySelector('button.builder-mode-selector')).not.toBeNull();
      expect(container.querySelector('.builder-choice')).toBeNull();
      await act(async () => {
        container
          .querySelector('button.builder-mode-selector')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(document.body.querySelector('.builder-choice-modal')?.textContent).toMatch(/Who builds this round/i);
      // Full first-time install stays under a closed disclosure — continue, not a reset.
      const details = container.querySelector<HTMLDetailsElement>('[data-testid="connect-setup-details"]');
      expect(details).not.toBeNull();
      expect(details?.open).toBe(false);
      // One waiting caption in the foot — not "Writing code" while we wait on the agent.
      expect(container.querySelector('.studio-context-phase')?.textContent).toMatch(/Waiting for your agent/i);
      expect(container.querySelector('.studio-context-phase-spinner')).toBeNull();
      expect(container.querySelector('.status-feedback-route')).toBeNull();
      expect(container.textContent?.toLowerCase()).not.toMatch(/\btoken\b/);
    } finally {
      await act(async () => {
        root.unmount();
      });
      vi.unstubAllGlobals();
    }
  });

  it('offers platform handoff when the self agent called end, without reconnect chrome', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      stall: 'ended',
      builder: 'self',
      events: [],
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'ended-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      expect(container.querySelector('.studio-connect')).toBeNull();
      expect(container.querySelector('.status-warning')?.textContent).toMatch(/finished this round/i);
      expect(container.querySelector('.builder-mode-selector')?.textContent).toContain('Your agent');
      expect(container.querySelector('button.builder-mode-selector')).not.toBeNull();
      expect(container.querySelector('.builder-choice')).toBeNull();
      // Handoff, not mid-build — no live working turn and no foot "Writing code".
      expect(container.querySelector('.studio-turn.is-working')).toBeNull();
      expect(container.querySelector('.studio-thread-context')).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('lets a live self round stop and switch to the platform agent', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      builder: 'self',
      events: [],
    });
    mockedHandoffToPlatform.mockResolvedValue({});

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'live-self-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      const control = container.querySelector<HTMLElement>('[data-testid="active-switch-builder"]');
      expect(control?.textContent).toContain('Switch to Gamedev.pl agent');
      expect(container.querySelector('.studio-turn.is-working')).not.toBeNull();

      await act(async () => {
        control?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(control?.textContent).toMatch(/Stop your agent and let Gamedev\.pl continue/i);

      await act(async () => {
        control
          ?.querySelector<HTMLButtonElement>('.is-primary')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(mockedHandoffToPlatform).toHaveBeenCalledWith('live-self-token', { stopActiveSelfAgent: true });
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('still offers switch-to-self once the platform agent has ended, not just while it is live', async () => {
    // Regression: the control used to require the agent still be actively working.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      builder: 'platform',
      stall: 'ended',
      agentEndedAt: '2026-08-12T20:00:00.000Z',
      events: [],
    });
    mockedHandoffToSelf.mockResolvedValue({});

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'ended-platform-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      const control = container.querySelector<HTMLElement>('[data-testid="active-switch-builder-self"]');
      expect(control).not.toBeNull();

      await act(async () => {
        control?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      await act(async () => {
        control
          ?.querySelector<HTMLButtonElement>('.is-primary')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(mockedHandoffToSelf).toHaveBeenCalledWith('ended-platform-token');
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('hides the switch-builder control while a message is sending, not just while the agent is live', async () => {
    // Regression: the handoff button had no "sending" gate at all.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      builder: 'platform',
      stall: 'ended',
      agentEndedAt: '2026-08-12T20:00:00.000Z',
      events: [],
    });
    let resolveSend!: (value: { ok: boolean; target: string }) => void;
    mockedSubmitFeedback.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'ended-platform-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      expect(container.querySelector('[data-testid="active-switch-builder-self"]')).not.toBeNull();

      const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
      await act(async () => {
        if (textarea) {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          setter?.call(textarea, 'Please make the car faster and add a boost pad.');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await flushEffects();
      });
      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('.status-composer-send')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });

      expect(container.querySelector('.status-composer.is-sending')).not.toBeNull();
      expect(container.querySelector('[data-testid="active-switch-builder-self"]')).toBeNull();
      // Sending sits inline next to Send now, not a row below.
      expect(container.querySelector('.status-composer-toolbar-right .status-feedback-sending')).not.toBeNull();

      await act(async () => {
        resolveSend({ ok: true, target: 'ended-platform-token' });
        await flushEffects();
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('keeps the live builder handoff in the composer, not the transcript', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      builder: 'platform',
      events: [],
    });
    mockedHandoffToSelf.mockResolvedValue({});

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'live-platform-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      // Badge hidden while STOP shows.
      expect(container.querySelector<HTMLElement>('[data-testid="active-switch-builder-self"]')).toBeNull();
      expect(container.querySelector('.builder-mode-selector')?.textContent).toContain('Gamedev.pl');
      expect(container.querySelector('.studio-turn.is-working')).not.toBeNull();
      expect(container.querySelector<HTMLTextAreaElement>('textarea')?.disabled).toBe(false);
      const stop = container.querySelector<HTMLButtonElement>('.status-composer-stop');
      expect(stop?.querySelector('svg')).not.toBeNull();
      expect(stop?.disabled).toBe(false);
      expect(stop?.getAttribute('aria-label')).toBe('Stop the current build and switch to your agent');
      expect(container.querySelector('.status-composer-send')).toBeNull();
      expect(container.querySelector('.studio-turn.is-working [data-testid^="active-switch-builder"]')).toBeNull();

      await act(async () => {
        stop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(mockedHandoffToSelf).toHaveBeenCalledWith('live-platform-token');
      // Badge reappears while the stop request is pending.
      const control = container.querySelector<HTMLElement>('[data-testid="active-switch-builder-self"]');
      expect(control?.closest('.status-composer-toolbar-left')).not.toBeNull();
      expect(container.querySelector('.studio-active-handoff-pending')?.textContent).toMatch(
        /waiting for the current agent to acknowledge the stop request/i,
      );
      expect(mockedHandoffToSelf).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('offers a retry once a stop request has been pending too long', async () => {
    // An unconfirmed stop should not strand the creator forever.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      builder: 'platform',
      events: [],
    });
    mockedHandoffToSelf.mockResolvedValue({});

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'stale-stop-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      const stop = container.querySelector<HTMLButtonElement>('.status-composer-stop');
      await act(async () => {
        stop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(mockedHandoffToSelf).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.studio-active-handoff-pending')?.textContent).toMatch(
        /waiting for the current agent to acknowledge the stop request/i,
      );
      // No retry yet — ordinary short wait, not stale.
      expect(container.querySelector('.studio-active-handoff-pending-group button')).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(HANDOFF_STALE_MS);
        await flushEffects();
      });

      expect(container.querySelector('.studio-active-handoff-pending')?.textContent).toMatch(
        /taking longer than usual/i,
      );
      const retry = container.querySelector<HTMLButtonElement>('.studio-active-handoff-pending-group button');
      expect(retry).not.toBeNull();

      await act(async () => {
        retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      expect(mockedHandoffToSelf).toHaveBeenCalledTimes(2);
      // Retrying restarts the clock.
      expect(container.querySelector('.studio-active-handoff-pending')?.textContent).toMatch(
        /waiting for the current agent to acknowledge the stop request/i,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('keeps a pending builder handoff visible in the composer', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      builder: 'platform',
      builderHandoff: { target: 'self', requestedAt: '2026-08-12T20:00:00.000Z' },
      events: [],
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'pending-platform-handoff-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      expect(container.querySelector('.studio-turn.is-working [data-testid^="active-switch-builder"]')).toBeNull();
      expect(container.querySelector('.status-composer .studio-active-handoff-pending')?.textContent).toMatch(
        /waiting for the current agent to acknowledge the stop request/i,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('does not expose a destructive stop control from the live row', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      builder: 'platform',
      events: [],
    });
    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'interrupt-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      expect(container.querySelector('.studio-turn.is-working [data-testid^="active-switch-builder"]')).toBeNull();
      expect(container.querySelector<HTMLTextAreaElement>('textarea')?.disabled).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('names a delivery-cap stop for a self round', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      failure: { reason: 'self_build_delivery_cap' },
      events: [],
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'cap-token', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      expect(container.querySelector('.status-warning')?.textContent).toContain('delivery limit');
      expect(container.querySelector('.studio-connect')).toBeNull();
      expect(container.textContent?.toLowerCase()).not.toMatch(/\btoken\b/);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('names a gate bounce in Studio even when the thread already has turns', async () => {
    // The bounce reason used to live only in emptyLabel — once the agent had posted
    // planning notes, "Needs a tweak" was a label with no explanation above the box.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      failure: { reason: 'gate_red' },
      events: [
        {
          id: 'e1',
          kind: 'step',
          step: 'planning',
          text: 'Sketching the board.',
          createdAt: '2026-07-30T12:00:00.000Z',
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'gate-red-token', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-warning')?.textContent).toContain('Automatic checks failed');
    expect(container.textContent).toContain('Needs a tweak');
    // Active repair round — builder is locked server-side; do not offer a switch that 409s.
    expect(container.querySelector('.builder-choice')).toBeNull();
    expect(container.querySelector('button.builder-mode-selector')).toBeNull();

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

    // Credentialed: this address serves a game before it is published too, and the
    // creator's own session is what makes that theirs to open.
    expect(fetchSpy).toHaveBeenCalledWith('/api/games/sky-dodge', { credentials: 'include' });
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
        revisions: [],
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

  it('shows a failed preview gate instead of spinning forever', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      preview: { slug: 'space-runner' },
      previewGate: { green: false, ranAt: '2026-08-08T20:17:15Z', report: 'audio.sounds is required' },
      progress: { headSha: 'failed-preview', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockRejectedValue(Object.assign(new Error('not ready'), { status: 409 }));
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'failed-preview-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.textContent).toContain('The preview checks failed');
    expect(container.textContent).toContain('audio.sounds is required');
    expect(container.querySelector('.status-preview-spinner')).toBeNull();

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
        progress: { headSha: currentSha, commits: [], checklist: [], revisions: [] },
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

      // A remount (effect deps / act flush order) can race a second preview fetch before
      // the first lands; what matters is the count then stays flat until headSha moves.
      const previewCallsAfterMount = mockedGetSubmissionPreview.mock.calls.length;
      expect(previewCallsAfterMount).toBeGreaterThanOrEqual(1);
      // Nothing is embedded inline — the draft plays in the theater on demand.
      expect(container.querySelector('iframe')).toBeNull();

      // A status poll fires (still headSha "sha-1") — must NOT re-fetch the preview.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
      });
      expect(mockedGetSubmissionStatus).toHaveBeenCalledTimes(2);
      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(previewCallsAfterMount);

      // The agent pushes a new commit — the next poll picks up a new headSha, which
      // must trigger a silent preview refresh (no click needed).
      currentSha = 'sha-2';
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
      });

      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(previewCallsAfterMount + 1);

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
        progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
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
      status: 'in_review',
      phase: 'ready_for_review',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
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

  it('seeds a parent-supplied draft into the compact composer and reports it consumed', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/draft-token/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onDraftConsumed = vi.fn();

    await act(async () => {
      root.render(
        createElement(SubmissionStatusView, {
          token: 'draft-token',
          embedded: true,
          draft: { text: 'The game crashed with: Bastion requires gfx3d', seq: 1 },
          onDraftConsumed,
        }),
      );
      await flushEffects();
      await flushEffects();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    expect(textarea?.value).toBe('The game crashed with: Bastion requires gfx3d');
    expect(onDraftConsumed).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('shows a sending indicator on the compact composer while the request is in flight', async () => {
    // The compact send is icon-only. Disabling it without a spinner or "Sending…" left
    // creators staring at a grey arrow with no idea whether anything was happening —
    // and when the upstream hung, that was the last thing the page ever did.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    let resolveSend!: (value: { ok: boolean; target: string }) => void;
    mockedSubmitFeedback.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/feedback-token/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'feedback-token', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    // Compact Studio composer must preserve CSS height while empty.
    expect(textarea).not.toBeNull();
    expect(textarea?.style.height).toBe('');
    await act(async () => {
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, 'Please make the car faster and add a boost pad.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await flushEffects();
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.status-composer-send')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(container.querySelector('.status-composer.is-sending')).not.toBeNull();
    expect(container.querySelector('.status-feedback-sending')?.textContent).toMatch(/Sending/i);
    // Not duplicated in the text row below — the button already has one.
    expect(container.querySelectorAll('.status-composer-send-spinner')).toHaveLength(1);
    expect(container.querySelector<HTMLButtonElement>('.status-composer-send')?.disabled).toBe(true);

    await act(async () => {
      resolveSend({ ok: true, target: 'pull_request' });
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-composer.is-sending')).toBeNull();
    // Studio composer: no Sent! receipt — the thread already echoes the message.
    expect(container.querySelector('.status-feedback-receipt')).toBeNull();
    expect(container.querySelector('.status-feedback-actions')).toBeNull();
    expect(container.textContent).toContain('Please make the car faster and add a boost pad.');

    await act(async () => {
      root.unmount();
    });
  });

  it('attaches an image pasted into the compact composer', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/feedback-token/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'feedback-token', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    const file = new File(['fake'], 'sprite.png', { type: 'image/png' });
    await act(async () => {
      const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(paste, 'clipboardData', {
        value: { items: [{ type: 'image/png', getAsFile: () => file }] },
      });
      textarea?.dispatchEvent(paste);
      // FileReader resolves on a real macrotask in jsdom, not a microtask.
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(container.querySelector('.status-composer-attachment-chip')).not.toBeNull();
    expect(container.querySelector('.status-composer-attachment-thumb')?.getAttribute('alt')).toBe('sprite.png');

    await act(async () => {
      root.unmount();
    });
  });

  it('blocks send until a pasted image finishes loading, so it never ships without it', async () => {
    // Codex #887: a same-tick send after paste could beat the FileReader.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    mockedSubmitFeedback.mockResolvedValue({ ok: true, target: 'pull_request' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/feedback-token/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'feedback-token', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    await act(async () => {
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, 'Match the sketch I just pasted please.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await flushEffects();
    });

    const file = new File(['fake'], 'sprite.png', { type: 'image/png' });
    await act(async () => {
      const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(paste, 'clipboardData', {
        value: { items: [{ type: 'image/png', getAsFile: () => file }] },
      });
      textarea?.dispatchEvent(paste);
      // Deliberately not awaiting the FileReader's macrotask here.
      await flushEffects();
    });

    const sendButton = container.querySelector<HTMLButtonElement>('.status-composer-send');
    expect(sendButton?.disabled).toBe(true);
    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(mockedSubmitFeedback).not.toHaveBeenCalled();

    await act(async () => {
      // Let the FileReader resolve.
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.querySelector<HTMLButtonElement>('.status-composer-send')?.disabled).toBe(false);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.status-composer-send')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(mockedSubmitFeedback).toHaveBeenCalledTimes(1);
    expect(mockedSubmitFeedback.mock.calls[0][2]).toMatchObject({ referenceImages: [expect.any(String)] });

    await act(async () => {
      root.unmount();
    });
  });

  it('sends from the compact composer on Enter and focuses the field from card chrome', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    mockedSubmitFeedback.mockResolvedValue({ ok: true, target: 'pull_request' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/enter-send/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'enter-send', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const composer = container.querySelector<HTMLElement>('.status-composer.is-compact');
    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    expect(composer).not.toBeNull();
    expect(textarea).not.toBeNull();
    // Empty resting shape: placeholder and send share a row.
    expect(composer?.classList.contains('is-empty')).toBe(true);

    const focusSpy = vi.spyOn(textarea!, 'focus');
    await act(async () => {
      composer?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'Please make the jumps shorter.');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });
    expect(composer?.classList.contains('is-empty')).toBe(false);

    await act(async () => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(mockedSubmitFeedback).toHaveBeenCalledWith(
      'enter-send',
      'Please make the jumps shorter.',
      undefined,
      'platform',
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps Shift+Enter as a newline in the compact composer', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    mockedSubmitFeedback.mockResolvedValue({ ok: true, target: 'pull_request' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/shift-enter/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'shift-enter', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'Please make the jumps shorter.');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });

    await act(async () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      textarea!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      await flushEffects();
    });

    expect(mockedSubmitFeedback).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('does not send from the compact composer while IME is composing', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    mockedSubmitFeedback.mockResolvedValue({ ok: true, target: 'pull_request' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/ime-enter/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'ime-enter', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'Please make the jumps shorter.');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });

    await act(async () => {
      // Override jsdom getters so composition is visible to the handler.
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'isComposing', { configurable: true, value: true });
      Object.defineProperty(event, 'keyCode', { configurable: true, value: 229 });
      textarea!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      await flushEffects();
    });

    expect(mockedSubmitFeedback).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps build pulse as the last transcript turn without checklist fraction, stop, or Play', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      slug: 'subaru-rally-championship',
      progress: {
        headSha: 'sha-1',
        commits: [],
        checklist: [
          { text: 'A', checked: true },
          { text: 'B', checked: true },
          { text: 'C', checked: true },
          { text: 'D', checked: true },
          { text: 'E', checked: false },
          { text: 'F', checked: false },
        ],
        revisions: [],
      },
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/build-pulse/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'build-pulse', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    // Claude-shaped: "Writing code" is the last transcript turn with a pulse, not a foot bar.
    const working = container.querySelector('.studio-turn.is-working');
    expect(working).not.toBeNull();
    expect(working?.textContent).toContain('Writing code');
    expect(container.querySelector('.studio-turn-working-pulse')).not.toBeNull();
    expect(container.querySelector('.studio-thread-context')).toBeNull();
    // Empty runway under the turns so the last message can scroll to the top of the pane.
    expect(container.querySelector('.studio-thread-scroll-pad')).not.toBeNull();
    expect(container.querySelector('.studio-thread-scroll-body')).not.toBeNull();
    expect(container.querySelector('.studio-turn.is-working [data-testid^="active-switch-builder"]')).toBeNull();
    expect(container.querySelector('.studio-thread-foot .studio-context-stop')).toBeNull();
    expect(container.querySelector('.studio-context-progress')).toBeNull();
    expect(container.querySelector('.status-play-cta')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('flashes a presence thought on the live working turn, not as a permanent chat bubble', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const at = new Date().toISOString();
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      lastAgentSignalAt: at,
      lastAgentPresence: { key: 'browsing_kit', at },
      events: [],
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/presence-thought/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'presence-thought', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const working = container.querySelector('.studio-turn.is-working.is-thought');
    expect(working).not.toBeNull();
    expect(working?.textContent).toContain('Browsing the Creator Kit');
    // Thought is the live working line — not a durable event bubble, and not the foot bar.
    expect(container.querySelectorAll('.studio-turn:not(.is-working)')).toHaveLength(0);
    expect(container.querySelector('.studio-thread-context')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('does not leave Writing code in the foot after the self agent ends', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      stall: 'ended',
      builder: 'self',
      agentEndedAt: '2026-08-05T12:15:00.000Z',
      events: [
        {
          id: 'e1',
          kind: 'step',
          step: 'testing',
          text: 'Preview build sent for checks.',
          createdAt: '2026-08-05T12:10:00.000Z',
        },
      ],
    });
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'ended-no-writing', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.studio-turn.is-working')).toBeNull();
    expect(container.querySelector('.studio-thread-context')).toBeNull();
    expect(container.querySelector('.status-warning')?.textContent).toMatch(/finished this round/i);
    // The finished event stays; the live "Writing code" line must not linger under it.
    expect(container.textContent).toContain('Preview build sent for checks.');
    expect(container.querySelector('.studio-thread-turns')?.textContent).not.toMatch(/Writing code/i);

    await act(async () => {
      root.unmount();
    });
  });

  it('says when a request on the creator’s side was written by their agent', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // Both rows sit on the creator's side of the thread, because both are their request.
    // Only one of them is in their own words; without the kicker the other reads as a
    // message they wrote — which is how a Polish creator met an English summary of
    // themselves.
    const at = new Date().toISOString();
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      events: [],
      progress: {
        headSha: 'sha',
        commits: [],
        checklist: [],
        revisions: [
          { text: 'Zrób paczki większe.', createdAt: at },
          {
            text: 'Zoom out the battlefield.',
            createdAt: new Date(Date.parse(at) + 1000).toISOString(),
            origin: 'agent',
          },
        ],
      },
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/relayed/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'relayed', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const turns = [...container.querySelectorAll('.studio-turn.is-mine')];
    expect(turns).toHaveLength(2);
    expect(turns[0].querySelector('.studio-turn-kicker')).toBeNull();
    expect(turns[1].querySelector('.studio-turn-kicker')?.textContent).toBe('Summarized by your agent');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows whether a message sent mid-build has been picked up from the agent inbox yet, and still allows sending', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const at = new Date().toISOString();
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      events: [],
      progress: {
        headSha: 'sha',
        commits: [],
        checklist: [],
        revisions: [
          { text: 'Still waiting on the agent.', createdAt: at, delivered: false },
          {
            text: 'The agent already read this one.',
            createdAt: new Date(Date.parse(at) + 1000).toISOString(),
            delivered: true,
          },
        ],
      },
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/delivery/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'delivery', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      const turns = [...container.querySelectorAll('.studio-turn.is-mine')];
      expect(turns).toHaveLength(2);
      const queuedBadge = turns[0].querySelector('.studio-turn-delivery');
      expect(queuedBadge?.textContent).toBe('Queued for the agent');
      expect(queuedBadge?.classList.contains('is-queued')).toBe(true);
      const deliveredBadge = turns[1].querySelector('.studio-turn-delivery');
      expect(deliveredBadge?.textContent).toBe('Delivered to the agent');
      expect(deliveredBadge?.classList.contains('is-delivered')).toBe(true);

      const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
      expect(textarea?.disabled).toBe(false);
      const sendButton = container.querySelector<HTMLButtonElement>('.status-composer-send');
      expect(sendButton?.disabled).toBe(true);

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      await act(async () => {
        nativeSetter?.call(textarea, 'Please make the enemies slower too.');
        textarea?.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.querySelector<HTMLButtonElement>('.status-composer-send')?.disabled).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('keeps a known-undelivered message marked queued even once the agent goes quiet', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      builder: 'self',
      events: [],
      progress: {
        headSha: 'sha',
        commits: [],
        checklist: [],
        revisions: [{ text: 'Never picked up.', createdAt: new Date().toISOString(), delivered: false }],
      },
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/quiet-delivery/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'quiet-delivery', embedded: true }));
        await flushEffects();
        await flushEffects();
      });

      const badge = container.querySelector('.studio-turn.is-mine .studio-turn-delivery');
      expect(badge?.textContent).toBe('Queued for the agent');
      expect(badge?.classList.contains('is-queued')).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('lets the creator dismiss a stall chip above the composer', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      stall: 'quiet',
      builder: 'platform',
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'chip-dismiss', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const chip = container.querySelector('.studio-status-chip');
    expect(chip?.textContent).toContain('quiet for a while');
    const dismiss = container.querySelector<HTMLButtonElement>('.studio-status-chip-dismiss');
    expect(dismiss).not.toBeNull();

    await act(async () => {
      dismiss?.click();
      await flushEffects();
    });

    expect(container.querySelector('.studio-status-chip')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('remembers dismissing the finished-round chip for later rounds', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      stall: 'ended',
      builder: 'platform',
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'ended-chip', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const dismiss = container.querySelector<HTMLButtonElement>('.studio-status-chip-dismiss');
    expect(dismiss).not.toBeNull();
    await act(async () => {
      dismiss?.click();
      await flushEffects();
    });
    expect(localStorage.getItem('gamedev_status_chip_dismissed:stall:ended')).toBe('1');

    await act(async () => {
      root.unmount();
    });

    const laterContainer = document.createElement('div');
    document.body.appendChild(laterContainer);
    const laterRoot = createRoot(laterContainer);
    await act(async () => {
      laterRoot.render(createElement(SubmissionStatusView, { token: 'another-round', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(laterContainer.querySelector('.studio-status-chip')).toBeNull();

    await act(async () => {
      laterRoot.unmount();
    });
  });

  it('hides the checklist fraction on the thread bar once every item is done', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'published',
      slug: 'global-thermonuclear-strategy',
      progress: {
        headSha: 'sha-1',
        commits: [],
        checklist: [
          { text: 'A', checked: true },
          { text: 'B', checked: true },
        ],
        revisions: [],
      },
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/done-bar/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'done-bar', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.studio-context-progress')).toBeNull();
    expect(container.querySelector('.studio-thread-context .studio-slug')).toBeNull();
    expect(container.querySelector('.status-play-cta')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('re-enables the compact send when the request fails, instead of staying disabled', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    mockedSubmitFeedback.mockRejectedValue(new Error('dispatch_failed'));
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/feedback-token/thread');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'feedback-token', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    await act(async () => {
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, 'Please make the car faster and add a boost pad.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await flushEffects();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.status-composer-send')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-feedback .error')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.status-composer-send')?.disabled).toBe(false);
    expect(container.querySelector('.status-composer.is-sending')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps polling after needs_changes so a restarted round can appear without a refresh', async () => {
    // needs_changes used to stop the poll. Feedback from that state starts another
    // round; without a follow-up poll the page kept saying "needs a tweak" forever.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    // Sticky mock: once-shots can vanish under Strict Mode.
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'needs_changes' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/needs-poll');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'needs-poll' }));
      await flushEffects();
    });

    expect(container.textContent).toContain('Needs a tweak');
    const callsAfterFirstPaint = mockedGetSubmissionStatus.mock.calls.length;
    expect(callsAfterFirstPaint).toBeGreaterThanOrEqual(1);

    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      progress: { headSha: 'sha-2', commits: [], checklist: [], revisions: [] },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await flushEffects();
    });

    expect(mockedGetSubmissionStatus.mock.calls.length).toBeGreaterThan(callsAfterFirstPaint);
    expect(container.textContent).toContain('Writing code');

    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
  });

  it('says the note was kept but no round started, instead of a bare “Sent!”', async () => {
    // A creator sent "where is my game?" into a thread that answered "Sent!" and then
    // stayed silent for three hours, because the agent account was out of premium
    // requests and the API swallowed the 412. "Sent" was true and useless.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'in_review',
      phase: 'ready_for_review',
      preview: { slug: 'space-runner' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    mockedSubmitFeedback.mockResolvedValue({
      ok: true,
      target: 'pull_request',
      roundStarted: false,
      reason: 'no_capacity',
    });
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

    const textarea = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    await act(async () => {
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, 'Please make the car faster and add a boost pad.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await flushEffects();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.status-feedback .primary-btn')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    const notice = container.querySelector('.status-feedback-notice');
    expect(notice?.textContent).toContain('out of capacity');
    // Not a success tick beside it: the round it promises is not running.
    expect(container.querySelector('.status-feedback-sent')).toBeNull();
    // And not an error either — the message is kept, so there is nothing to send again.
    expect(container.querySelector('.status-feedback .error')).toBeNull();
    // It still shows in the thread, because that is where it actually is.
    expect(container.querySelector('.build-activity-revision')?.textContent).toContain('boost pad');

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
    // A conversation's order: the creator's request, then the commit that answered it,
    // with the newest at the bottom next to the box they reply in.
    expect(entries[0]).toContain('Make the car faster please.');
    expect(entries[1]).toContain('Speed up the car');
    expect(container.querySelectorAll('.build-activity-revision')).toHaveLength(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('re-reads status the moment a backgrounded tab is looked at again', async () => {
    // A round a BYOCA agent opened while the tab was backgrounded and throttled
    // would otherwise sit stale until the creator reloaded the page.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'in_review', phase: 'ready_for_review' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/visibility-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'visibility-token' }));
      await flushEffects();
    });
    const callsBefore = mockedGetSubmissionStatus.mock.calls.length;

    const visSpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushEffects();
    });

    expect(mockedGetSubmissionStatus.mock.calls.length).toBeGreaterThan(callsBefore);
    visSpy.mockRestore();

    await act(async () => {
      root.unmount();
    });
  });

  it('re-reads status on window focus, for a sleep/wake that never toggled visibility', async () => {
    // Sleep/wake can leave the tab "visible" with no edge to catch.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'in_review', phase: 'ready_for_review' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/focus-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'focus-token' }));
      await flushEffects();
    });
    const callsBefore = mockedGetSubmissionStatus.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flushEffects();
    });

    expect(mockedGetSubmissionStatus.mock.calls.length).toBeGreaterThan(callsBefore);

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
        revisions: [],
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
      progress: { headSha: 'sha-1', commits: [], checklist: [], checks: 'FAILURE', revisions: [] },
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

  it('offers one-click CI debugging when a gate-red build needs changes', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      phase: 'needs_changes',
      builder: 'platform',
      failure: { reason: 'gate_red' },
    });
    mockedSubmitFeedback.mockResolvedValue({ ok: true, target: 'build_channel' });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'gate-red-token', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    const action = container.querySelector<HTMLButtonElement>('.status-feedback-quick-action');
    expect(action?.textContent).toContain('Fix checks');
    expect(action?.closest('.status-composer')).not.toBeNull();

    await act(async () => {
      action?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-feedback-quick-action')).toBeNull();
    expect(mockedSubmitFeedback).toHaveBeenCalledWith(
      'gate-red-token',
      'Fix the failing checks and submit a fixed build.',
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('names a dead build round and points at feedback as the retry', async () => {
    // `failed` arrives projected as `needs_changes`; without the failure banner the
    // page reads "waiting for your input" about a session that died.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      failure: { reason: 'task_failed' },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'failed-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-warning')?.textContent).toContain('stopped unexpectedly');

    await act(async () => {
      root.unmount();
    });
  });

  it('falls back to the generic failure copy for a reason it has never heard of', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'needs_changes',
      failure: { reason: 'some_future_reason' },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'future-failure-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-warning')?.textContent).toContain('ended with an error');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the stall banner the API has been sending all along', async () => {
    // The API computed `stall` for months; the page never rendered it. A build that
    // has gone quiet now says so instead of leaving silence to speak for it.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      stall: 'quiet',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'stalled-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.status-warning')?.textContent).toContain('quiet for a while');

    await act(async () => {
      root.unmount();
    });
  });

  it('does not say "Writing code" over a platform round that has gone quiet', async () => {
    // Reported live: the badge/foot said the agent was mid-build while the amber
    // banner right below it said the opposite — "quiet for a while". `isAgentWorkActive`
    // only excluded `stall === 'ended'`, so a quiet (not-yet-ended) round still read as
    // active work with a 6-hour-old heartbeat under it.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      stall: 'quiet',
      builder: 'platform',
      events: [
        {
          id: 'e1',
          kind: 'step',
          step: 'testing',
          text: 'Fixing the failing tests.',
          createdAt: '2026-08-22T16:34:27.000Z',
        },
      ],
    });
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'quiet-platform', embedded: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.studio-turn.is-working')).toBeNull();
    expect(container.querySelector('.studio-thread-context')).toBeNull();
    expect(container.querySelector('.status-warning')?.textContent).toMatch(/quiet for a while/i);
    expect(container.querySelector('.studio-thread-turns')?.textContent).not.toMatch(/Writing code/i);

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
    expect(arm?.textContent).toContain('Abandon this build');

    // Arming must not call the API — this is the mis-tap guard.
    await act(async () => {
      arm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(mockedAbandonSubmission).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Abandon this round?');

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

  it('shows pictures of the build on the thread, before any commit exists', async () => {
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
    // Oldest first, like the rest of the thread: the newest picture is the one nearest
    // the composer, which is where the eye already is.
    expect(shots[0]!.getAttribute('src')).toContain('/api/submissions/media-token/shot/shot-1');
    expect(shots[1]!.getAttribute('src')).toContain('/api/submissions/media-token/shot/shot-2');
    // The agent's own caption is what the creator reads, not a generic placeholder.
    expect(container.textContent).toContain('The bridge holds');
    expect(container.querySelector('.status-lightbox')).toBeNull();

    // Clicking one opens it full size; Escape closes it again.
    await act(async () => {
      (container.querySelector('.build-activity-shot') as HTMLButtonElement).click();
    });
    const lightbox = container.querySelector('.status-lightbox-image') as HTMLImageElement | null;
    expect(lightbox).not.toBeNull();
    expect(lightbox!.getAttribute('src')).toContain('/api/submissions/media-token/shot/shot-1');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('.status-lightbox')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('emits gate_verdict only on a live transition, not on reload of a finished build', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.useFakeTimers();

    // Reload into an already-published self build: must not mint gate_verdict.
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'published',
      builder: 'self',
    });
    window.history.pushState(null, '', '/status/verdict-reload');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'verdict-reload', embedded: true }));
      await flushEffects();
      await flushEffects();
    });
    expect(mockedRecordStudioStep).not.toHaveBeenCalledWith('gate_verdict', expect.anything(), expect.anything());

    await act(async () => {
      root.unmount();
    });
    mockedRecordStudioStep.mockClear();

    // Live transition: building → in_review should emit green once.
    mockedGetSubmissionStatus
      .mockResolvedValueOnce({ status: 'building', builder: 'self' })
      .mockResolvedValue({ status: 'in_review', builder: 'self' });
    window.history.pushState(null, '', '/status/verdict-live');
    const live = document.createElement('div');
    document.body.appendChild(live);
    const liveRoot = createRoot(live);

    await act(async () => {
      liveRoot.render(createElement(SubmissionStatusView, { token: 'verdict-live', embedded: true }));
      await flushEffects();
      await flushEffects();
    });
    expect(mockedRecordStudioStep).not.toHaveBeenCalledWith('gate_verdict', 'self', 'green');

    await act(async () => {
      vi.advanceTimersByTime(ACTIVE_POLL_MS);
      await flushEffects();
      await flushEffects();
    });
    expect(mockedRecordStudioStep).toHaveBeenCalledWith('gate_verdict', 'self', 'green');

    await act(async () => {
      liveRoot.unmount();
    });
    vi.useRealTimers();
  });

  it('emits round_opened on the first status snapshot when openedBy is set', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'queued',
      builder: 'self',
      openedBy: 'agent',
    });
    window.history.pushState(null, '', '/status/round-opened-first');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'round-opened-first', embedded: true }));
      await flushEffects();
      await flushEffects();
    });
    expect(mockedRecordStudioStep).toHaveBeenCalledWith('round_opened', 'self', 'agent');

    await act(async () => {
      root.unmount();
    });
  });

  /**
   * Publishing is terminal: a post-publish improvement opens a *new* job on its own
   * thread. These lock the handoff — the creator moving onto the new build thread rather
   * than being left on the published (dead) one while its connect card sits unnoticed.
   *
   * The harness stands in for CreatorStudioView: it owns which thread is on screen and
   * switches it to the new token when the child reports the improvement, marking the new
   * mount as the handoff destination — exactly what the studio does via `onImproved`.
   */
  function HandoffHarness({ initialToken }: { initialToken: string }) {
    const [threadToken, setThreadToken] = useState(initialToken);
    const [handedOff, setHandedOff] = useState(false);
    return createElement(SubmissionStatusView, {
      key: threadToken,
      token: threadToken,
      embedded: true,
      justHandedOff: handedOff,
      onImproved: (next: string) => {
        setThreadToken(next);
        setHandedOff(true);
      },
    });
  }

  const CONNECT_PAYLOAD = {
    installSnippets: {
      claudeCode: 'claude mcp add gamedevpl https://example.test/api/mcp',
      codex: 'url = "https://example.test/api/mcp"',
      cursor: '{"mcpServers":{}}',
      kimi: 'npx mcp-remote https://example.test/api/mcp',
      cli: 'curl https://example.test/api/mcp',
    },
    installLinks: {
      cursor:
        'cursor://anysphere.cursor-deeplink/mcp/install?name=gamedevpl&config=' +
        btoa(JSON.stringify({ url: 'https://example.test/api/mcp' })),
      vscode: `vscode:mcp/install?${encodeURIComponent(
        JSON.stringify({ name: 'gamedevpl', type: 'http', url: 'https://example.test/api/mcp' }),
      )}`,
    },
    kickoffPrompt:
      'Build "Handoff Game" for gamedev.pl.\nStart with the gamedevpl tool, slug: handoff-game.\nstart returns your workflow; after gate green the round is done.',
    mcpUrl: 'https://example.test/api/mcp',
    authorizationHeader: 'Authorization: Bearer test-key-not-for-display',
    authorizationHeaderMasked: 'Authorization: Bearer ····play',
    fingerprint: 'play',
    keyGeneration: 1,
    slug: 'handoff-game',
  };

  it('standalone: a published improve navigates the browser to the new job’s thread', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'published', slug: 'tv-tycoon' });
    mockedSubmitImprovement.mockResolvedValue({ ok: true, jobId: 42, token: 'new-standalone-job', slug: 'tv-tycoon' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/live-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      // Standalone: no `embedded`, no `onImproved` — the view drives the browser itself.
      root.render(createElement(SubmissionStatusView, { token: 'live-token' }));
      await flushEffects();
    });

    const box = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(box, 'Please add a checkpoint before the hard second level jump.');
      box!.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });
    await act(async () => {
      container
        .querySelector('.status-feedback .primary-btn')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(mockedSubmitImprovement).toHaveBeenCalled();
    // The old (published) token cannot address the new round — the browser is on the new one.
    expect(window.location.pathname).toBe(statusPath('new-standalone-job'));

    await act(async () => {
      root.unmount();
    });
  });

  it('standalone: a chat-only reply on a published game refreshes the thread without a token', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // A `reply` outcome carries no jobId/token/slug — see runChatAgent.
    mockedSubmitImprovement.mockResolvedValue({ ok: true });
    let calls = 0;
    mockedGetSubmissionStatus.mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? { status: 'published', slug: 'tv-tycoon' }
        : {
            status: 'published',
            slug: 'tv-tycoon',
            progress: {
              headSha: '',
              commits: [],
              checklist: [],
              revisions: [
                { text: 'is it done yet?', createdAt: new Date().toISOString() },
                {
                  text: 'Still polishing — no changes to report yet.',
                  createdAt: new Date().toISOString(),
                  origin: 'studio',
                },
              ],
            },
          };
    });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/status/reply-only-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'reply-only-token' }));
      await flushEffects();
    });

    const box = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(box, 'is it done yet?');
      box!.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });
    await act(async () => {
      container
        .querySelector('.status-feedback .primary-btn')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    // Published stops the poll timer; refresh must come from send.
    expect(mockedGetSubmissionStatus).toHaveBeenCalledTimes(2);
    // No new round opened, so no handoff navigation fired.
    expect(window.location.pathname).toBe('/status/reply-only-token');
    expect(container.querySelector('.build-activity-studio')?.textContent).toContain(
      'Still polishing — no changes to report yet.',
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('embedded: a published self-improve switches the thread and surfaces the new round’s connect card', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const connectFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...CONNECT_PAYLOAD, expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
    }));
    vi.stubGlobal('fetch', connectFetch);

    // The published job is self-built; its improvement is a new self job still waiting
    // on the creator's own agent — the state that renders the connect card.
    mockedGetSubmissionStatus.mockImplementation(async (token: string) =>
      token === 'new-self-job'
        ? { status: 'queued', stall: 'no_agent_yet', builder: 'self' }
        : { status: 'published', slug: 'tv-tycoon', defaultBuilder: 'self' },
    );
    mockedSubmitImprovement.mockResolvedValue({ ok: true, jobId: 77, token: 'new-self-job', slug: 'tv-tycoon' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/pub-self');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(HandoffHarness, { initialToken: 'pub-self' }));
        await flushEffects();
        await flushEffects();
      });

      // The published thread has no connect card of its own — it is terminal.
      expect(container.querySelector('.studio-connect')).toBeNull();

      const box = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(box, 'Give the second level a checkpoint so it is not so punishing.');
        box!.dispatchEvent(new Event('input', { bubbles: true }));
        await flushEffects();
      });
      await act(async () => {
        container.querySelector('.status-composer-send')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
        await flushEffects();
        await flushEffects();
      });

      // The default builder came from the status payload (self), so the new round is self.
      expect(mockedSubmitImprovement).toHaveBeenCalledWith('pub-self', expect.any(String), undefined, 'self');
      // The thread moved onto the new job, announced itself, and shows that job's connect card.
      expect(container.querySelector('.status-handoff-notice')?.textContent).toContain('new build thread');
      expect(container.querySelector('.studio-connect')).not.toBeNull();
      expect(container.textContent).toContain('Connect your coding agent');
    } finally {
      await act(async () => {
        root.unmount();
      });
      vi.unstubAllGlobals();
    }
  });

  it('embedded: a published platform-improve hands off with no connect card', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockImplementation(async (token: string) =>
      token === 'new-plat-job'
        ? { status: 'building', builder: 'platform', events: [] }
        : { status: 'published', slug: 'tv-tycoon', defaultBuilder: 'platform' },
    );
    mockedSubmitImprovement.mockResolvedValue({ ok: true, jobId: 88, token: 'new-plat-job', slug: 'tv-tycoon' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/pub-plat');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(HandoffHarness, { initialToken: 'pub-plat' }));
      await flushEffects();
      await flushEffects();
    });

    const box = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(box, 'Please tune the difficulty curve on the later levels.');
      box!.dispatchEvent(new Event('input', { bubbles: true }));
      await flushEffects();
    });
    await act(async () => {
      container.querySelector('.status-composer-send')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
      await flushEffects();
    });

    // Handed over to the new build thread, but a platform round connects nothing.
    expect(container.querySelector('.status-handoff-notice')?.textContent).toContain('new build thread');
    expect(container.querySelector('.studio-connect')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('published composer defaults its builder badge to the status defaultBuilder, over stale local memory', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // Memory is keyed by token in localStorage, and a new job has a new token — so the
    // remembered choice is gone at exactly this boundary. The status payload's
    // defaultBuilder is the continuity, and it wins even over a stale local value.
    localStorage.setItem('gamedev_last_builder:pub-def', 'platform');
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'published', slug: 'tv-tycoon', defaultBuilder: 'self' });
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio/pub-def');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'pub-def', embedded: true }));
      await flushEffects();
    });

    expect(container.querySelector('.builder-mode-selector')?.textContent).toContain(i18n.t('builder.badge.self'));
    await act(async () => {
      container
        .querySelector('button.builder-mode-selector')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    const selected = document.body.querySelector('.builder-choice-option[aria-checked="true"]');
    expect(selected?.textContent).toContain(i18n.t('builder.self.title'));

    await act(async () => {
      root.unmount();
    });
  });

  it.each(['en', 'pl'])('announces the handoff on the destination thread (%s)', async (lang) => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'building', builder: 'platform', events: [] });
    await i18n.changeLanguage(lang);
    window.history.pushState(null, '', '/studio/handed-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'handed-token', embedded: true, justHandedOff: true }));
      await flushEffects();
    });

    const notice = container.querySelector('.status-handoff-notice');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain(i18n.t('statusView.handoff.notice'));
    // The copy carries a real sentence in each locale, not a leaked key.
    expect(notice?.textContent).not.toContain('statusView.handoff');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows prior rounds collapsed above the live thread, and dismiss hides them', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      slug: 'tv-tycoon',
      events: [
        {
          id: 'e1',
          kind: 'step',
          step: 'mechanics',
          text: 'Working on the current round.',
          createdAt: '2026-08-05T08:00:00.000Z',
        },
      ],
      priorRounds: [
        {
          id: '101',
          createdAt: '2026-08-01T10:00:00.000Z',
          publishedAt: '2026-08-02T12:00:00.000Z',
          status: 'published',
          entries: [
            { kind: 'revision', text: 'Make TVMAX louder.', createdAt: '2026-08-01T11:00:00.000Z' },
            {
              kind: 'event',
              step: 'polishing',
              text: 'Competitor volume tuned.',
              createdAt: '2026-08-01T12:00:00.000Z',
            },
          ],
        },
      ],
    });
    window.history.pushState(null, '', '/studio/history-token');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'history-token', embedded: true }));
      await flushEffects();
    });

    const prior = container.querySelector('[data-testid="studio-prior-rounds"]');
    expect(prior).not.toBeNull();
    const details = prior?.querySelector('details.studio-prior-round');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(prior?.textContent).toContain(i18n.t('statusView.history.summaryPublished'));
    // Collapsed: entry text is in the DOM for expand, live round is separate.
    expect(container.textContent).toContain('Make TVMAX louder.');
    expect(container.textContent).toContain('Working on the current round.');

    const dismiss = prior?.querySelector('.studio-prior-round-dismiss') as HTMLButtonElement;
    expect(dismiss).not.toBeNull();
    await act(async () => {
      dismiss.click();
      await flushEffects();
    });
    expect(container.querySelector('[data-testid="studio-prior-rounds"]')).toBeNull();
    expect(localStorage.getItem('gamedev_prior_round_hide:tv-tycoon:101')).toBe('1');
    expect(container.textContent).toContain('Working on the current round.');

    await act(async () => {
      root.unmount();
    });
  });
});
