import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleReplLine } from './repl.js';
import { shellInvocation } from './repl-shell.js';
import type { ApiClient } from './api.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-shell-'));
  roots.push(root);
  const lines: string[] = [];
  const writes: string[] = [];
  const abort: { current: AbortController | null } = { current: null };
  const request = vi.fn(() => {
    throw new Error('Shell commands must stay local');
  });
  const api = { request, origin: 'https://shell.test' } as unknown as ApiClient;
  return {
    root,
    lines,
    writes,
    request,
    input: {
      api,
      token: null,
      conversationId: 'same-conversation',
      allowShell: true,
      cwd: root,
      env: { ...process.env, SHELL: '/bin/bash', SHELL_MARK: 'local-value' },
      abort,
      write: (line: string) => {
        writes.push(line);
        lines.push(...line.split('\n'));
      },
    },
  };
}

it('selects the user shell with a platform fallback and preserves the command', () => {
  expect(shellInvocation('echo one | cat', { SHELL: '/bin/zsh' }, 'darwin')).toEqual({
    command: 'echo one | cat',
    args: [],
    shell: '/bin/zsh',
  });
  expect(shellInvocation('echo one', {}, 'linux').shell).toBe('/bin/bash');
  expect(shellInvocation('echo one', { ComSpec: 'custom-cmd.exe' }, 'win32')).toEqual({
    command: 'echo one',
    args: [],
    shell: 'custom-cmd.exe',
  });
});

describe.skipIf(process.platform === 'win32')('local REPL shell commands', () => {
  it('runs offline in the checkout with shell syntax and preserves the conversation', async () => {
    const f = fixture();
    const root = join(f.root, 'game with spaces');
    mkdirSync(root);
    const result = await handleReplLine({
      ...f.input,
      workshop: { root } as NonNullable<Parameters<typeof handleReplLine>[0]['workshop']>,
      line: `!printf '%s\\n' "$PWD" "$SHELL_MARK"; printf 'one\\ntwo\\n' | tail -1; printf 'problem\\n' >&2; printf 'no newline'; exit 7`,
    });
    expect(f.lines).toContain(root);
    expect(f.lines).toContain('local-value');
    expect(f.lines).toContain('two');
    expect(f.lines).toContain('problem');
    expect(f.lines).toContain('no newline');
    expect(f.lines.at(-1)).toBe('Shell command exited with code 7.');
    expect(result).toEqual({ next: 'continue', conversationId: 'same-conversation' });
    expect(f.input.abort.current).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
  });

  it('explains a bare bang and refuses shell execution without terminal opt-in', async () => {
    const f = fixture();
    await handleReplLine({ ...f.input, line: '!' });
    expect(f.lines.at(-1)).toContain('!pwd');
    await handleReplLine({ ...f.input, allowShell: undefined, line: '!touch should-not-exist' });
    expect(existsSync(join(f.root, 'should-not-exist'))).toBe(false);
    expect(f.lines.at(-1)).toContain('terminal session');
    expect(f.request).not.toHaveBeenCalled();
  });

  it('streams output before completion and cancels the whole process group', async () => {
    const f = fixture();
    writeFileSync(
      join(f.root, 'worker.cjs'),
      `const {spawn}=require('node:child_process');
const {writeFileSync}=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
writeFileSync('child.pid',String(child.pid));
process.on('SIGTERM',()=>{});
console.log('ready');
setInterval(()=>{},1000);`,
    );
    let finished = false;
    const run = handleReplLine({ ...f.input, line: `!"${process.execPath}" worker.cjs` }).then((value) => {
      finished = true;
      return value;
    });
    try {
      await vi.waitFor(() => expect(f.lines).toContain('ready'));
      expect(finished).toBe(false);
      const pid = Number(readFileSync(join(f.root, 'child.pid'), 'utf8'));
      f.input.abort.current!.abort();
      expect(await run).toEqual({ next: 'continue', conversationId: 'same-conversation' });
      await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
      expect(f.lines.at(-1)).toBe('Shell command stopped.');
      expect(f.input.abort.current).toBeNull();
      expect(f.request).not.toHaveBeenCalled();
    } finally {
      f.input.abort.current?.abort();
      await run;
    }
  }, 15_000);

  it('reports a missing shell and clears cancellation state', async () => {
    const f = fixture();
    await handleReplLine({ ...f.input, env: { SHELL: join(f.root, 'missing-shell') }, line: '!pwd' });
    expect(f.lines.at(-1)).toContain('Could not run shell command:');
    expect(f.input.abort.current).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
  });

  it('caps huge unterminated output, strips terminal controls and still reports completion', async () => {
    const f = fixture();
    writeFileSync(
      join(f.root, 'output.cjs'),
      `process.stdout.write('\u001b[2Jhello\u001b[0m\\n'); process.stdout.write('x'.repeat(400000));`,
    );
    await handleReplLine({ ...f.input, line: `!"${process.execPath}" output.cjs` });
    expect(f.lines).toContain('hello');
    expect(f.lines.join('')).not.toContain('\u001b');
    expect(f.lines.join('')).toContain('Shell output truncated');
    expect(f.lines.join('').length).toBeLessThan(257_000);
    expect(f.lines.at(-1)).toBe('Shell command exited with code 0.');
  });

  it('batches newline-heavy output and bounds transcript rows', async () => {
    const f = fixture();
    writeFileSync(join(f.root, 'lines.cjs'), `process.stdout.write('x\\n'.repeat(128000));`);
    await handleReplLine({ ...f.input, line: `!"${process.execPath}" lines.cjs` });
    expect(f.writes.length).toBeLessThan(20);
    expect(f.lines.length).toBeLessThanOrEqual(2002);
    expect(f.lines).toContain('Shell output truncated; redirect to a file to keep the full output.');
    expect(f.lines.at(-1)).toBe('Shell command exited with code 0.');
  });
});
