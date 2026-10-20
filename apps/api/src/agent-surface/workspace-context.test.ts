import { describe, expect, it } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import { buildPrompt } from './build-prompt.js';
import { InMemoryStore } from '../platform/store.js';
import { kickoffContextLines, loadKickoffContext } from './workspace-context.js';

const BRIEF = {
  jobId: 3,
  slug: 'tiny',
  spec: 'A race game.',
  channelToken: 't',
  apiBaseUrl: 'https://x',
} as BuildBrief;

describe('kickoff context', () => {
  it('inlines pending messages and creator notes, fenced, and says when no files exist', async () => {
    const store = new InMemoryStore();
    const record = await store.createSubmission(3, 'g:owner', 'Tiny');
    await store.setSubmissionSlug(3, 'tiny');
    const note = await store.appendCreatorMessage(3, 'Cars look bad ```x```');
    const context = await loadKickoffContext(store, (await store.getSubmission(3)) ?? record, 'none');
    expect(context).toMatchObject({ noFiles: true, slug: 'tiny', notes: { text: '', revision: 0 } });
    const lines = kickoffContextLines(context).join('\n');
    expect(lines).toContain('This game has no files yet');
    expect(lines).toContain(`id \`${note.id}\`:`);
    expect(lines).toContain("Cars look bad '''x'''");
    expect(lines).toContain('revision 0 saves the first');
  });

  it('drops the reads the kickoff already carries from the opening steps', () => {
    const lines = ['Your workspace is already mounted.'];
    const fresh = buildPrompt(BRIEF, {
      shell: true,
      workspace: lines,
      inlined: { inbox: true, notes: true, noFiles: true },
    });
    expect(fresh).toContain('1. `start`');
    expect(fresh).toContain('2. One short `report_progress`');
    expect(fresh).not.toContain('Call `get_sources` before deciding anything');
    const revision = buildPrompt(
      { ...BRIEF, feedback: 'faster', undelivered: true, previewVersion: 'v1' } as BuildBrief,
      { shell: true, workspace: lines, mountedSources: true, inlined: { inbox: true, notes: true, noFiles: false } },
    );
    expect(revision).toContain('2. `get_brief`.');
    expect(revision).toContain('under “Creator messages not yet acknowledged”');
    expect(buildPrompt(BRIEF, { shell: true, workspace: lines })).toContain('`read_inbox`, `creator_notes`');
  });
});
