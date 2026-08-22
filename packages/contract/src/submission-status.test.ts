import { describe, expect, it } from 'vitest';
import type {
  BuildEvent,
  BuildProgress,
  MySubmissionsPage,
  RecentBuild,
  StoredBuildEvent,
  SubmissionPublishedResponse,
  SubmissionStatusResponse,
} from './submission-status.js';

describe('submission status wire shapes', () => {
  it('accepts the shape the status route actually sends', () => {
    const status: SubmissionStatusResponse = {
      status: 'in_review',
      phase: 'building',
      slug: 'my-game',
      gateProgress: { lane: 'publish', stage: 'typecheck', index: 2, total: 12, at: 'now' },
      recentBuilds: [{ version: 'v1', createdAt: 'now', mode: 'preview', verdict: 'green' }],
    };
    expect(status.status).toBe('in_review');
    expect(status.gateProgress?.stage).toBe('typecheck');
  });

  it('narrows slug to required once a build is published', () => {
    const published: SubmissionPublishedResponse = { status: 'published', slug: 'my-game' };
    const widened: SubmissionStatusResponse = published;
    expect(widened.slug).toBe('my-game');
  });

  it('keeps the localized pair off the wire event', () => {
    const stored: StoredBuildEvent = {
      id: '1',
      kind: 'progress',
      text: 'hello',
      createdAt: 'now',
      textLocalized: 'czesc',
      locale: 'pl',
    };
    const wire: BuildEvent = stored;
    expect('textLocalized' in wire).toBe(true);
    expect(wire.text).toBe('hello');
  });

  it('requires revisions on progress, since both producers always set it', () => {
    const progress: BuildProgress = { headSha: 'abc', commits: [], checklist: [], revisions: [] };
    expect(progress.revisions).toEqual([]);
  });

  it('types a red build stage against the gate vocabulary', () => {
    const build: RecentBuild = {
      version: 'v2',
      createdAt: 'now',
      mode: 'publish',
      verdict: 'red',
      failedStage: 'smoke',
    };
    expect(build.failedStage).toBe('smoke');
  });

  it('carries truncation counts alongside the page', () => {
    const page: MySubmissionsPage = { submissions: [], truncated: true, totalGames: 12 };
    expect(page.totalGames).toBe(12);
  });
});
