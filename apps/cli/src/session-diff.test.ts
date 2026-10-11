import { expect, it } from 'vitest';
import { createSessionController } from './session-controller.js';
import { sessionDiff } from './session-diff.js';

const patch =
  'Diff: platform → local\n\n--- platform/game.ts\n+++ local/game.ts\n@@ -1 +1 @@\n-const a = `old`;\n+const a = `new`;';

it('keeps a complete patch separately and a single summary in conversation and history', () => {
  const session = createSessionController('');
  session.writeLine('› /diff');
  session.writeLine(patch);
  session.writeLine('Round status: in_review');
  expect(session.get().lines).toHaveLength(3);
  expect(session.get().diffs[0]?.lines.join('\n')).toBe(patch);
  expect(session.get().diffs[0]?.files).toEqual(['game.ts']);
  expect(session.savedHistory().lines.join('\n')).not.toContain('const a');
  expect(session.savedHistory().lines).toContain('Diff was viewed; run /diff again to refresh.');
  session.close();
});

it('retains the eight latest diffs without treating JSON or ordinary output as a viewer', () => {
  const session = createSessionController('');
  for (let i = 0; i < 12; i++) session.writeLine(patch);
  expect(session.get().diffs.map((diff) => diff.id)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  expect(sessionDiff(JSON.stringify({ patches: [patch] }), 1)).toBeUndefined();
  expect(sessionDiff('Working tree clean — no differences against the platform.', 1)).toBeUndefined();
  session.close();
});
