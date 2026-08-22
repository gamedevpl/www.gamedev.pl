import { describe, expect, it } from 'vitest';
import {
  cliActor,
  filterAssessments,
  flagValue,
  formatAssessmentLine,
  formatResolutionLine,
  hasFlag,
  positional,
} from './assessment-cli.js';
import type { GameAssessment } from './store.js';

function row(overrides: Partial<GameAssessment> = {}): GameAssessment {
  return {
    id: 'sky-dodge:g:alice',
    slug: 'sky-dodge',
    title: 'Sky Dodge',
    source: 'catalog',
    creatorHandle: null,
    reviewerUid: 'g:alice',
    verdict: 'cut',
    note: 'Controls are broken.',
    noteOrigin: 'text',
    checklist: null,
    clientContext: null,
    gameVersion: null,
    resolution: null,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    ...overrides,
  };
}

const addressed = {
  status: 'addressed' as const,
  comment: 'Rebuilt the touch controls.',
  link: 'https://example.test/pr/12',
  resolvedAt: '2026-08-21T09:00:00.000Z',
  resolvedBy: 'cli:ada',
};

describe('assessment CLI args', () => {
  it('finds the slug whatever the flag order', () => {
    expect(positional(['sky-dodge', '--status', 'addressed'])).toBe('sky-dodge');
    expect(positional(['--reviewer', 'g:alice', 'sky-dodge'])).toBe('sky-dodge');
    // A boolean flag before the slug must not swallow it.
    expect(positional(['--dry-run', 'sky-dodge'])).toBe('sky-dodge');
    expect(positional(['--comment', 'sky-dodge'])).toBeUndefined();
    expect(positional(['--open'])).toBeUndefined();
  });

  it('reads flag values and presence', () => {
    expect(flagValue(['--limit', '10'], '--limit')).toBe('10');
    expect(flagValue(['--limit'], '--limit')).toBeUndefined();
    expect(flagValue([], '--limit')).toBeUndefined();
    expect(hasFlag(['--json'], '--json')).toBe(true);
    expect(hasFlag(['--json'], '--open')).toBe(false);
  });

  it('names the operator behind a CLI write', () => {
    expect(cliActor('ada')).toBe('cli:ada');
    expect(cliActor(undefined)).toBe('cli:unknown');
  });
});

describe('assessment CLI filters', () => {
  const rows = [
    row({ reviewerUid: 'g:alice', verdict: 'cut' }),
    row({ reviewerUid: 'g:bob', verdict: 'keep', resolution: addressed }),
  ];

  it('narrows by reviewer, verdict and follow-up state', () => {
    expect(filterAssessments(rows, {}).length).toBe(2);
    expect(filterAssessments(rows, { reviewerUid: 'g:bob' }).map((r) => r.verdict)).toEqual(['keep']);
    expect(filterAssessments(rows, { verdict: 'cut' }).map((r) => r.reviewerUid)).toEqual(['g:alice']);
    expect(filterAssessments(rows, { onlyOpen: true }).map((r) => r.reviewerUid)).toEqual(['g:alice']);
    expect(filterAssessments(rows, { onlyResolved: true }).map((r) => r.reviewerUid)).toEqual(['g:bob']);
    // Both at once is a contradiction, not everything.
    expect(filterAssessments(rows, { onlyOpen: true, onlyResolved: true })).toEqual([]);
  });
});

describe('assessment CLI formatting', () => {
  it('shows the follow-up state on the row line', () => {
    expect(formatAssessmentLine(row())).toContain('OPEN');
    expect(formatAssessmentLine(row({ resolution: addressed }))).toContain('addressed');
  });

  it('spells out what was done, with the link when there is one', () => {
    expect(formatResolutionLine(row())).toBe('open');
    expect(formatResolutionLine(row({ resolution: addressed }))).toBe(
      'addressed — Rebuilt the touch controls. (https://example.test/pr/12)',
    );
    expect(formatResolutionLine(row({ resolution: { ...addressed, link: null } }))).toBe(
      'addressed — Rebuilt the touch controls.',
    );
  });
});
