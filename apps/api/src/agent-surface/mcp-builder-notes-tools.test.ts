import { describe, expect, it } from 'vitest';
import { InMemoryStore, type SubmissionRecord } from '../platform/store.js';
import { createBuilderNotesTools, type BuilderNotesToolsDeps } from './mcp-builder-notes-tools.js';
import type { ToolContext } from './mcp-tool-support.js';

const JOB = 7;
const CTX = { bearerToken: 'opener' } as unknown as ToolContext;
const NOW = Date.parse('2026-10-17T00:00:00Z');
const OPENER = { jobId: JOB, roundGeneration: 1, exp: NOW / 1000 + 3600, shell: false };

async function setup(overrides: Partial<BuilderNotesToolsDeps> = {}) {
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Rocks');
  await store.setSubmissionSlug(JOB, 'rocks');
  const record = (await store.getSubmission(JOB)) as SubmissionRecord;
  const deps: BuilderNotesToolsDeps = {
    resolveAuth: async () => ({ jobId: JOB, record: { ...record, roundGeneration: 1 }, claims: {} }),
    managedOpener: () => OPENER,
    store,
    now: () => NOW,
    ...overrides,
  };
  const call = (args: Record<string, unknown>) => createBuilderNotesTools(deps).builder_notes!.handler(args, CTX);
  return { store, call };
}

describe('builder_notes', () => {
  it('reads empty, replaces, and reads back the game’s notes without a shell', async () => {
    const { call } = await setup();
    expect((await call({})).structuredContent).toEqual({ notes: '' });
    expect((await call({ notes: '  uses a tile grid; boss in boss.ts  ' })).structuredContent).toMatchObject({
      saved: true,
    });
    expect((await call({})).structuredContent).toMatchObject({ notes: 'uses a tile grid; boss in boss.ts' });
  });

  it('refuses without a managed opener for this platform round', async () => {
    for (const overrides of [
      { managedOpener: () => null },
      { managedOpener: () => ({ ...OPENER, roundGeneration: 2 }) },
      { managedOpener: () => ({ ...OPENER, exp: 1 }) },
    ] satisfies Array<Partial<BuilderNotesToolsDeps>>) {
      const { call } = await setup(overrides);
      expect((await call({ notes: 'x' })).structuredContent).toMatchObject({ code: 'not_owner' });
    }
  });

  it('refuses over-long notes and reports a write the round outran', async () => {
    const { store, call } = await setup();
    expect((await call({ notes: 'x'.repeat(4001) })).structuredContent).toMatchObject({ code: 'invalid_arguments' });
    await store.bumpRoundGeneration(JOB);
    expect((await call({ notes: 'late' })).isError).toBe(true);
    expect(await store.getBuilderNotes('rocks')).toBeNull();
  });
});
