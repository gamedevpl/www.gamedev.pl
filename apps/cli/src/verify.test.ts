import { describe, expect, it } from 'vitest';
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
});
