import { describe, expect, it } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import { buildPrompt } from './build-prompt.js';
import { InMemoryStore } from '../platform/store.js';
import { inlinedBy, kickoffContextLines, loadKickoffContext } from './workspace-context.js';

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
    expect(inlinedBy(context)).toMatchObject({ inbox: false, messages: true });
  });

  it('drops the reads the kickoff already carries from the opening steps', () => {
    const lines = ['Your workspace is already mounted.'];
    const fresh = buildPrompt(BRIEF, {
      shell: true,
      workspace: lines,
      inlined: { inbox: true, messages: false, notes: true, noFiles: true },
    });
    expect(fresh).toContain('1. `start`');
    expect(fresh).toContain('2. One short `report_progress`');
    expect(fresh).not.toContain('Call `get_sources` before deciding anything');
    const revision = buildPrompt(
      { ...BRIEF, feedback: 'faster', undelivered: true, previewVersion: 'v1' } as BuildBrief,
      {
        shell: true,
        workspace: lines,
        mountedSources: true,
        inlined: { inbox: false, messages: true, notes: true, noFiles: false },
      },
    );
    expect(revision).toContain('2. `get_brief` and `read_inbox`.');
    expect(revision).toContain('Call `read_inbox` once as well');
    expect(revision).toContain('under “Creator messages not yet acknowledged”');
    expect(buildPrompt(BRIEF, { shell: true, workspace: lines })).toContain('`read_inbox`, `creator_notes`');
  });

  it('keeps read_inbox when the pending messages do not all fit', async () => {
    const store = new InMemoryStore();
    const record = await store.createSubmission(3, 'g:owner', 'Tiny');
    for (let i = 0; i < 11; i += 1) await store.appendCreatorMessage(3, `note ${i}`);
    const context = await loadKickoffContext(store, (await store.getSubmission(3)) ?? record, 'none');
    expect(context.pending).toHaveLength(10);
    expect(inlinedBy(context)).toMatchObject({ inbox: false, messages: false, notes: true });
    expect(kickoffContextLines(context).join('\n')).toContain('`read_inbox` returns every pending message');
    const long = await loadKickoffContext(
      {
        listPendingCreatorMessages: async () => [{ id: 'm', text: 'x'.repeat(4001) }],
        getCreatorNotes: async () => null,
      } as never,
      record,
      'none',
    );
    expect(inlinedBy(long)).toMatchObject({ inbox: false, messages: false });
  });
});
