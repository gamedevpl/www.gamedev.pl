import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { AgentEvent } from 'genaicode/agents';
import { loadAdapters } from './adapters.js';
import { headlessArgs, runHeadlessAgent } from './headless-agent.js';
import { EVIDENCE_MARKER } from './workbench-evidence.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakeCli(body: string): { root: string; command: string } {
  const root = mkdtempSync(join(tmpdir(), 'gd-headless-'));
  roots.push(root);
  const command = join(root, 'agent');
  writeFileSync(command, `#!${process.execPath}\n${body}`, { mode: 0o700 });
  return { root, command };
}

const adapter = (name: string) => loadAdapters().adapters.find((spec) => spec.name === name)!;

it('keeps the adapter flags and passes the prompt last, with Codex screenshots as images', () => {
  const image = '/tmp/shot.png';
  const prompt = 'fix it' + EVIDENCE_MARKER + JSON.stringify({ name: 'shot.png', mime: 'image/png', path: image });
  const codex = adapter('codex');
  expect(headlessArgs(codex, prompt)).toEqual([...codex.headless, `--image=${image}`, prompt]);
  expect(headlessArgs(adapter('opencode'), '-x')).toEqual([...adapter('opencode').headless, '-x']);
});

it('delivers events, raw lines and stderr lines from a headless run', async () => {
  const { root, command } = fakeCli(`
console.log(JSON.stringify({ type: 'text', part: { text: process.env.VIBE_ACTIVE_MODEL ?? 'no model' } }));
console.log('plain output');
process.stderr.write('warn one\\nwarn ');
process.stderr.write('two\\n');
console.log(JSON.stringify({ type: 'step_finish', part: {} }));
`);
  const events: AgentEvent[] = [];
  const lines: string[] = [];
  const result = await runHeadlessAgent({
    spec: { ...adapter('opencode'), command },
    prompt: 'hi',
    cwd: root,
    env: process.env,
    timeoutMs: 10_000,
    onEvent: (event) => events.push(event),
    onLine: (line) => lines.push(line),
  });
  expect(result.code).toBe(0);
  const shown = events.filter((event) => event.type !== 'usage' && event.type !== 'done');
  // Stdout and stderr are separate pipes, so only the set is stable.
  expect(shown).toHaveLength(4);
  expect(shown).toEqual(
    expect.arrayContaining([
      { type: 'message', text: 'no model' },
      { type: 'raw', line: 'plain output' },
      { type: 'stderr', text: 'warn one' },
      { type: 'stderr', text: 'warn two' },
    ]),
  );
  expect(lines).toContain('plain output');
  expect(lines).toContain('warn two');
  expect(lines.some((line) => line.includes('"step_finish"'))).toBe(true);
});

it('passes the Vibe model through its environment and reports a reported failure', async () => {
  const { root, command } = fakeCli(`
console.log(JSON.stringify({ type: 'message', role: 'assistant', content: [{ type: 'text', text: process.env.VIBE_ACTIVE_MODEL }] }));
process.exit(3);
`);
  const events: AgentEvent[] = [];
  const result = await runHeadlessAgent({
    spec: { ...adapter('vibe'), command, selection: { model: 'devstral' } },
    prompt: 'hi',
    cwd: root,
    env: process.env,
    timeoutMs: 10_000,
    onEvent: (event) => events.push(event),
  });
  expect(result.code).toBe(3);
  expect(events).toContainEqual({ type: 'message', text: 'devstral' });
});

it('reports a CLI that cannot start', async () => {
  const events: AgentEvent[] = [];
  const result = await runHeadlessAgent({
    spec: { ...adapter('gemini'), command: '/nonexistent/gemini' },
    prompt: 'hi',
    cwd: tmpdir(),
    env: process.env,
    timeoutMs: 10_000,
    onEvent: (event) => events.push(event),
  });
  expect(result.code).toBe(1);
  expect(events.some((event) => event.type === 'error' && event.message.includes('gemini'))).toBe(true);
});
