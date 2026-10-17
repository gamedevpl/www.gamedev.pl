import { describe, expect, it } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import { buildPromptOpening } from './build-prompt-opening.js';

const BRIEF = { jobId: 1, slug: 'rocks', spec: 's', channelToken: 't', apiBaseUrl: 'https://x' } as BuildBrief;

describe('buildPromptOpening for an undelivered round', () => {
  it('points at the brief and inbox when the creator note was queued', () => {
    const opening = buildPromptOpening({ ...BRIEF, undelivered: true, feedback: 'faster' }, 'rocks', false);
    expect(opening).toContain('`get_brief` and `read_inbox` together');
  });

  it('points at the inlined request when the queue write failed', () => {
    const brief = { ...BRIEF, undelivered: true, feedback: 'faster', feedbackQueueFailed: true };
    const opening = buildPromptOpening(brief, 'rocks', false);
    expect(opening).toContain('“What the creator asked for” below');
    expect(opening).not.toContain('`read_inbox` together');
  });

  it('names the played preview instead of a lost session when one exists', () => {
    const brief = { ...BRIEF, undelivered: true, feedback: 'slower', previewVersion: 'v1' };
    const opening = buildPromptOpening(brief, 'rocks', false);
    expect(opening).toContain(
      'Your latest preview of `rocks` (version v1) was delivered and the creator has written since',
    );
    expect(opening).not.toContain('ended without delivering');
    expect(opening).toContain('Call `list_staged_sources` before your first edit');
    expect(opening).not.toContain('Call `clear_staged_sources`');
  });

  it('keeps the plain opening for an operator retry, which carries no creator note', () => {
    const brief = { ...BRIEF, undelivered: true, feedback: '', previewVersion: 'v1' };
    expect(buildPromptOpening(brief, 'rocks', false)).toContain('ended without delivering');
  });
});
