import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLadder } from './verify.js';

describe('verification ladder', () => {
  it('runs typecheck and check:static always, check:game only for publish', () => {
    const ran: string[] = [];
    const run = (_cmd: string, args: string[]) => {
      ran.push(args.join(' '));
      return { status: 0, stderr: '' };
    };
    expect(runLadder({ cwd: '/tmp/game', publish: false, run }).ok).toBe(true);
    expect(ran).toEqual(['run typecheck', 'run check:static']);
    ran.length = 0;
    expect(runLadder({ cwd: '/tmp/game', publish: true, run }).ok).toBe(true);
    expect(ran).toContain('run check:game');
  });

  it('stops on the first red stage', () => {
    const result = runLadder({
      cwd: '/tmp/game',
      publish: true,
      run: (_cmd, args) =>
        args.includes('check:static') ? { status: 1, stderr: 'static failed' } : { status: 0, stderr: '' },
    });
    expect(result).toEqual({ ok: false, stage: 'check_static', detail: 'static failed' });
  });

  it('does not expose creator credentials to workspace scripts', () => {
    const previousToken = process.env.GAMEDEV_TOKEN;
    const previousSecret = process.env.UNRELATED_SECRET;
    process.env.GAMEDEV_TOKEN = 'gdpl_pat_creator-secret';
    process.env.UNRELATED_SECRET = 'kept';
    try {
      const environments: NodeJS.ProcessEnv[] = [];
      const result = runLadder({
        cwd: '/tmp/game',
        publish: true,
        run: (_cmd, _args, _cwd, env) => {
          environments.push(env);
          return { status: 0, stderr: '' };
        },
      });
      expect(result.ok).toBe(true);
      expect(environments).toHaveLength(3);
      expect(environments.every((env) => env.GAMEDEV_TOKEN === undefined)).toBe(true);
      expect(environments.every((env) => env.UNRELATED_SECRET === 'kept')).toBe(true);
    } finally {
      if (previousToken === undefined) delete process.env.GAMEDEV_TOKEN;
      else process.env.GAMEDEV_TOKEN = previousToken;
      if (previousSecret === undefined) delete process.env.UNRELATED_SECRET;
      else process.env.UNRELATED_SECRET = previousSecret;
    }
  });

  it('uses the Creator Kit verification contract when present', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'gamedevpl-verify-contract-'));
    try {
      writeFileSync(
        join(cwd, 'kit.json'),
        JSON.stringify({
          cliVerification: { typecheck: 'check:types', checkStatic: 'check:assets', checkGame: 'check:publish' },
        }),
      );
      const ran: string[] = [];
      const result = runLadder({
        cwd,
        publish: true,
        run: (_cmd, args) => {
          ran.push(args[1]!);
          return { status: 0, stderr: '' };
        },
      });
      expect(result.ok).toBe(true);
      expect(ran).toEqual(['check:types', 'check:assets', 'check:publish']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

it('retains filenames and stdout in a failed verification', () => {
  const result = runLadder({
    cwd: '/checkout',
    publish: false,
    run: () => ({ status: 1, stderr: 'Forbidden JavaScript:\n  - setup.mjs', stdout: 'Compiler detail' }),
  });
  expect(result).toMatchObject({ ok: false, detail: 'Forbidden JavaScript:\n  - setup.mjs\nCompiler detail' });
});
