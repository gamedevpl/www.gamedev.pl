import { describe, expect, it } from 'vitest';
import { InMemoryStore, type SubmissionRecord } from '../platform/store.js';
import { createCreatorNotesTools, type CreatorNotesToolsDeps } from './mcp-creator-notes-tools.js';
import type { ToolContext } from './mcp-tool-support.js';

const JOB = 7;
const CTX = { bearerToken: 'opener' } as unknown as ToolContext;
const NOW = Date.parse('2026-10-17T00:00:00Z');
const OPENER = { jobId: JOB, roundGeneration: 1, exp: NOW / 1000 + 3600, shell: false };

async function setup(overrides: Partial<CreatorNotesToolsDeps> = {}) {
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Rocks');
  await store.setSubmissionSlug(JOB, 'rocks');
  const record = (await store.getSubmission(JOB)) as SubmissionRecord;
  const deps: CreatorNotesToolsDeps = {
    resolveAuth: async () => ({ jobId: JOB, record: { ...record, roundGeneration: 1 }, claims: {} }),
    managedOpener: () => OPENER,
    store,
    now: () => NOW,
    ...overrides,
  };
  const call = (args: Record<string, unknown>) => createCreatorNotesTools(deps).creator_notes!.handler(args, CTX);
  return { store, call };
}

describe('creator_notes', () => {
  it('reads empty, replaces, and reads back the creator’s notes without a shell', async () => {
    const { call } = await setup();
    expect((await call({})).structuredContent).toEqual({ notes: '', revision: 0 });
    expect(
      (await call({ notes: '  prefers pixel art; dislikes timers  ', revision: 0 })).structuredContent,
    ).toMatchObject({ saved: true, revision: 1 });
    expect((await call({})).structuredContent).toMatchObject({
      notes: 'prefers pixel art; dislikes timers',
      revision: 1,
    });
  });

  it('hands back the newer notes when another round wrote first', async () => {
    const { call } = await setup();
    await call({ notes: 'first round', revision: 0 });
    const stale = await call({ notes: 'second round', revision: 0 });
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent).toMatchObject({ notes: 'first round', revision: 1 });
    expect((await call({ notes: 'first round; second round', revision: 1 })).structuredContent).toMatchObject({
      revision: 2,
    });
    expect((await call({ notes: 'x' })).structuredContent).toMatchObject({ code: 'invalid_arguments' });
  });

  it('refuses without a managed opener for this platform round', async () => {
    for (const overrides of [
      { managedOpener: () => null },
      { managedOpener: () => ({ ...OPENER, roundGeneration: 2 }) },
      { managedOpener: () => ({ ...OPENER, exp: 1 }) },
    ] satisfies Array<Partial<CreatorNotesToolsDeps>>) {
      const { call } = await setup(overrides);
      expect((await call({ notes: 'x', revision: 0 })).structuredContent).toMatchObject({ code: 'not_owner' });
    }
  });

  it('refuses over-long notes and reports a write the round outran', async () => {
    const { store, call } = await setup();
    expect((await call({ notes: 'x'.repeat(4001), revision: 0 })).structuredContent).toMatchObject({
      code: 'invalid_arguments',
    });
    await store.bumpRoundGeneration(JOB);
    expect((await call({ notes: 'late', revision: 0 })).isError).toBe(true);
    expect(await store.getCreatorNotes('g:owner')).toBeNull();
  });
});
