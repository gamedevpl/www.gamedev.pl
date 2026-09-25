import { readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, it } from 'vitest';
import { taskOutput } from './task-output.js';
import { createEventRenderer } from './agent-render.js';

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
    expect(shown).toEqual(['error: dependency install failed', 'codex ▸ I improved the controls.']);
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

it('hides all tool operations without losing diagnostics', () => {
  const shown: string[] = [];
  const output = taskOutput((line) => shown.push(line));
  try {
    output.write('codex ▸ ⚙ /bin/zsh -lc "cat game.ts"');
    output.write('codex ▸ ⚙ /bin/zsh -lc "cat model.ts"');
    output.write('codex ▸ ⚙ /bin/zsh -lc "cat runtime.ts"');
    output.write('error: command failed');
    output.write('codex ▸ ⚙ /bin/zsh -lc "pwd"');
    output.write('codex ▸ ⚙ /bin/zsh -lc "ls"');
    output.flush();
    output.flush();
    expect(shown).toEqual(['error: command failed']);
    const log = readFileSync(output.path, 'utf8');
    expect(log.match(/\/bin\/zsh/g)).toHaveLength(5);
    expect(log).toContain('cat model.ts');
    expect(log).toContain('error: command failed');
  } finally {
    rmSync(dirname(output.path), { recursive: true, force: true });
  }
});

it('keeps Muse chatter out of conversation and preserves milestone status across tools', () => {
  const shown: string[] = [],
    activity: string[] = [];
  const output = taskOutput(
    (line) => shown.push(line),
    (line) => activity.push(line),
  );
  try {
    output.progress('editing: Adding ramps', false);
    for (let i = 0; i < 20; i++) {
      output.raw('{"event":"heartbeat"}');
      output.write('muse ▸ Waiting for model response');
      output.write('muse ▸ ⚙ tool:read_file');
    }
    expect(shown).toEqual([]);
    expect(activity.at(-1)).toBe('editing: Adding ramps');
    output.progress('blocked: Need access', true);
    expect(shown).toEqual(['Agent blocked: blocked: Need access']);
    expect(readFileSync(output.path, 'utf8')).toContain('tool:read_file');
  } finally {
    rmSync(dirname(output.path), { recursive: true, force: true });
  }
});

it('keeps successful MCP calls in diagnostics and failed MCP calls visible', () => {
  const shown: string[] = [];
  const output = taskOutput((line) => shown.push(line));
  const render = createEventRenderer('codex');
  try {
    for (const isError of [false, true]) {
      const name = 'gamedevpl_local/report_progress';
      for (const event of [
        { type: 'tool-start', id: String(isError), name },
        { type: 'tool-end', id: String(isError), name, isError },
      ] as const)
        for (const line of render.event(event)) output.write(line);
    }
    expect(shown).toEqual(['codex ▸ Tool failed: gamedevpl_local/report_progress']);
    expect(readFileSync(output.path, 'utf8')).toContain('gamedevpl_local/report_progress');
  } finally {
    rmSync(dirname(output.path), { recursive: true, force: true });
  }
});
