import { describe, expect, it } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import { buildPromptOpening, clockLines, openingSteps } from './build-prompt-opening.js';

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

// 2026-10-24: a mounted round on a clock skipped all three.
describe('openingSteps', () => {
  it('marks every opening step required, the clock included', () => {
    const steps = openingSteps(BRIEF, {
      workspace: true,
      mountedSources: true,
      inlined: { inbox: true, messages: true, notes: true, noFiles: true },
    }).join('\n');
    expect(steps).toContain(
      'in this order (each step is required and takes seconds; the clock is no reason to skip one)',
    );
    expect(steps).toMatch(
      /`get_brief`.*\n3\. One `knowledge_query`.*\n4\. One short `report_progress`.*before you open any kit or game file/s,
    );
  });

  // 2026-11-16: the system prompt line alone was not followed.
  it('numbers the advisor consultation for a new game on a mounted workspace only', () => {
    const lane = { workspace: true, mountedSources: true, inlined: { noFiles: true } };
    const fresh = openingSteps(BRIEF, lane).join('\n');
    expect(fresh).toMatch(/\n5\. Consult your advisor now, before you open any kit or game file/);
    expect(fresh).toContain('is the only consultation of the round');
    expect(fresh).toContain('If no advisor answers, plan it yourself and go on');
    expect(openingSteps({ ...BRIEF, feedback: 'faster' }, lane).join('\n')).not.toContain('advisor');
    expect(openingSteps(BRIEF, { ...lane, workspace: false }).join('\n')).not.toContain('advisor');
  });

  // 2026-11-17: the advisor planned before seeing references.
  it('reads mounted reference images before the advisor', () => {
    const lane = { workspace: true, mountedSources: true, mountedReferences: true, inlined: { noFiles: true } };
    const steps = openingSteps(BRIEF, lane).join('\n');
    expect(steps).toMatch(/\n5\. `read` every mounted reference image.*\n6\. Consult your advisor now/s);
    expect(openingSteps(BRIEF, { ...lane, mountedReferences: false }).join('\n')).not.toContain('reference image');
    expect(openingSteps({ ...BRIEF, feedback: 'faster' }, lane).join('\n')).not.toContain('reference image');
  });

  // 2026-11-16: one report in a six-minute round.
  it('names required progress points on a mounted workspace', () => {
    const lane = { workspace: true, mountedSources: true };
    const mounted = openingSteps({ ...BRIEF, feedback: 'faster' }, lane).join('\n');
    expect(mounted).toContain('when the game first typechecks, after each capture, saying what the frames showed');
    expect(openingSteps(BRIEF, { ...lane, workspace: false }).join('\n')).not.toContain('first typechecks');
  });
});

// 2026-11-17: the builder blamed the clock for each skipped step.
describe('clockLines', () => {
  it('calls a long limit a safety net and a short one a clock', () => {
    const long = clockLines(1200).join('\n');
    expect(long).toContain('cancelled after 20 minutes');
    expect(long).toContain('a safety net, not a pace to keep');
    expect(long).toContain('not for an early `end`');
    expect(long).not.toContain('Do not reply with a plan');
    expect(clockLines(90).join('\n')).toContain('A typical revision takes minutes');
    expect(clockLines().join('\n')).toContain('cancelled after a hard time limit');
  });
});
