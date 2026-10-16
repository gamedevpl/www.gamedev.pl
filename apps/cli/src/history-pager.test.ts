import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiClient } from './api.js';
import { historyOutput } from './history-pager.js';
import { dispatchReadVerb } from './verbs.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gamedev-pager-'));
  dirs.push(dir);
  const script = join(dir, 'pager with spaces.cjs'),
    received = join(dir, 'received.txt');
  writeFileSync(
    script,
    `const fs=require('node:fs'); const mode=process.argv[2]; let data=''; process.stdin.on('data',chunk=>{ data+=chunk; if(mode==='quit') process.exit(0); }); process.stdin.on('end',()=>{setTimeout(()=>{fs.writeFileSync(process.argv[3],data);process.exit(mode==='fail'?3:0)},mode==='delay'?100:0)});`,
  );
  const chunks: string[] = [];
  const io = {
    stdin: { isTTY: true },
    stdout: {
      isTTY: true,
      columns: 80,
      write: (text: string) => {
        chunks.push(text);
        return true;
      },
    } as unknown as NodeJS.WriteStream,
  };
  const env = (mode = 'read') => ({
    PAGER: `${quote(process.execPath)} ${quote(script)} ${quote(mode)} ${quote(received)}`,
  });
  return { dir, received, chunks, io, env };
}

describe.skipIf(process.platform === 'win32')('real pager processes', () => {
  it('streams literal history into a configured pager with quoted arguments', async () => {
    const f = fixture(),
      output = historyOutput({ io: f.io, env: f.env() });
    const marker = join(f.dir, 'must-not-exist');
    const text = `History $(touch ${marker}) "quoted"`;
    expect(await output.write(text)).toBe(true);
    expect(await output.write('next entry')).toBe(true);
    const large = 'x'.repeat(500_000);
    expect(await output.write(large)).toBe(true);
    await output.finish();
    expect(readFileSync(f.received, 'utf8')).toBe(text + '\nnext entry\n' + large + '\n');
    expect(existsSync(marker)).toBe(false);
    expect(f.chunks).toEqual([]);
  });

  it('does not page JSON, pipes, disabled or dumb terminals, or PAGER=cat/empty', async () => {
    const f = fixture();
    for (const options of [
      { disabled: true },
      { io: { ...f.io, stdin: { isTTY: false } } },
      { io: { ...f.io, stdout: { ...f.io.stdout, isTTY: false } as NodeJS.WriteStream } },
      { env: { PAGER: 'must-not-execute', TERM: 'dumb' } },
      { env: { PAGER: '' } },
      { env: { PAGER: 'cat' } },
    ]) {
      const output = historyOutput({ io: f.io, env: { PAGER: 'must-not-execute' }, ...options });
      await output.write('plain');
      await output.finish();
    }
    expect(f.chunks).toEqual(Array(6).fill('plain\n'));
  });

  it('falls back to plain output if the default pager is unavailable and reports configured pager failures', async () => {
    const f = fixture();
    const missing = historyOutput({ io: f.io, env: { PATH: f.dir } });
    await missing.write('fallback');
    await missing.finish();
    expect(f.chunks).toEqual(['fallback\n']);
    const failed = historyOutput({ io: f.io, env: f.env('fail') });
    await failed.write('history');
    await expect(failed.finish()).rejects.toThrow('pager exited unsuccessfully');
    const api = { request: async () => ({ versions: [], hasMore: false }) } as unknown as ApiClient;
    await expect(
      dispatchReadVerb({ verb: 'log', args: ['probe'], flags: {}, api, io: f.io, env: f.env('fail') }),
    ).rejects.toThrow('pager exited unsuccessfully');
  });

  it('cancels an in-flight history request when the reader quits', async () => {
    const f = fixture();
    let calls = 0,
      aborted = false;
    const api = {
      request: async (_method: string, _path: string, _body: unknown, signal: AbortSignal) => {
        if (++calls === 1)
          return {
            versions: [{ version: 'v2', createdAt: '2026-10-16T00:00:00Z', summary: 'Change', verdict: 'passed' }],
            hasMore: true,
            nextCursor: 'v2',
          };
        return new Promise((_resolve, reject) => {
          const cancel = () => {
            aborted = true;
            reject(signal.reason);
          };
          signal.addEventListener('abort', cancel, { once: true });
          if (signal.aborted) cancel();
        });
      },
    } as unknown as ApiClient;
    expect(await dispatchReadVerb({ verb: 'log', args: ['probe'], flags: {}, api, io: f.io, env: f.env('quit') })).toBe(
      0,
    );
    expect(aborted).toBe(true);
    expect(calls).toBe(2);
  });

  it('waits for configured pagers to finish on API errors and preserves the original failure', async () => {
    const f = fixture();
    for (const mode of ['delay', 'fail']) {
      let calls = 0;
      const api = {
        request: async () => {
          if (++calls > 1) throw new Error('fixture API failure');
          return {
            versions: [
              { version: 'v2', createdAt: '2026-10-16T00:00:00Z', summary: 'Before failure', verdict: 'passed' },
            ],
            hasMore: true,
            nextCursor: 'v2',
          };
        },
      } as unknown as ApiClient;
      await expect(
        dispatchReadVerb({ verb: 'log', args: ['probe'], flags: {}, api, io: f.io, env: f.env(mode) }),
      ).rejects.toThrow('fixture API failure');
      expect(readFileSync(f.received, 'utf8')).toContain('Before failure');
      rmSync(f.received);
    }
  });
});
