import { readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, it } from 'vitest';
import { taskOutput } from './task-output.js';

it('keeps full details privately while showing readable tools and setup errors', () => {
  const shown: string[] = [];
  const output = taskOutput((line) => shown.push(line));
  try {
    output.preparing(true);
    output.write('added 32 packages');
    output.write('error: dependency install failed');
    output.preparing(false);
    output.write('codex ▸ ⚙ /bin/zsh -lc "cat game.ts"');
    output.write('codex ▸ I improved the controls.');
    expect(shown).toEqual([
      'error: dependency install failed',
      'codex · Running a shell command',
      'codex ▸ I improved the controls.',
    ]);
    const log = readFileSync(output.path, 'utf8');
    expect(log).toContain('added 32 packages');
    expect(log).toContain('/bin/zsh -lc "cat game.ts"');
    output.write(
      'verify failed at check_static: bad metadata\n> node tools/check-static.ts\nPASS graphics\n- EDITOR.json stale',
    );
    expect(shown.at(-1)).toContain('EDITOR.json stale');
    expect(shown.at(-1)).not.toContain('PASS graphics');
  } finally {
    rmSync(dirname(output.path), { recursive: true, force: true });
  }
});
