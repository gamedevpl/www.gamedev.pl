import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearRecoveryReady, isRecoveryReady, markRecoveryReady, recoveryPaths } from './recovery-state.js';
import { describeError } from './errors.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import type { DeliverySession } from './submit-session.js';

const SESSION: DeliverySession = { locked: true, canTakeOver: false, jobId: 7, generation: 2 };
const MARKER = '.gamedev-recovery-ready';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'recovery-state-'));
}

function corrupt(dir: string, body: string): void {
  writeFileSync(join(dir, MARKER), body);
}

describe('reading a damaged recovery marker', () => {
  // Each of these used to escape as a raw SyntaxError or TypeError.
  for (const [label, body] of [
    ['truncated', '{"slug":"my-ga'],
    ['empty', ''],
    ['a JSON null', 'null'],
    ['an array', '[]'],
    ['missing paths', '{"slug":"my-game","version":"v1","session":{"jobId":7,"generation":2}}'],
    ['a session without a job', '{"slug":"my-game","version":"v1","paths":[],"session":{}}'],
  ] as const) {
    it(`refuses ${label} by naming the file`, () => {
      const dir = root();
      corrupt(dir, body);
      let caught: unknown;
      try {
        isRecoveryReady(dir, 'my-game');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CliError);
      expect((caught as CliError).message).toContain(join(dir, MARKER));
      expect((caught as CliError).exitCode).toBe(EXIT_REFUSED);
    });
  }

  it('does not blame the network for a local file', () => {
    const dir = root();
    corrupt(dir, 'null');
    let caught: unknown;
    try {
      isRecoveryReady(dir, 'my-game');
    } catch (error) {
      caught = error;
    }
    // Every TypeError used to be reported as offline.
    expect(describeError(caught).message).not.toContain('offline');
    expect(describeError(caught).next).not.toContain('whoami');
  });

  it('refuses to hand back paths it could not read', () => {
    const dir = root();
    corrupt(dir, '{"slug":');
    expect(() => recoveryPaths(dir)).toThrow(CliError);
  });
});

describe('reading an intact recovery marker', () => {
  it('is not ready when no marker exists', () => {
    expect(isRecoveryReady(root(), 'my-game')).toBe(false);
  });

  it('is ready only for the slug it was written for', () => {
    const dir = root();
    markRecoveryReady(dir, 'my-game', SESSION, 'v3', ['SPEC.md']);
    expect(isRecoveryReady(dir, 'my-game')).toBe(true);
    expect(isRecoveryReady(dir, 'other-game')).toBe(false);
    expect(recoveryPaths(dir)).toEqual(['SPEC.md']);
  });

  it('is not ready once cleared', () => {
    const dir = root();
    markRecoveryReady(dir, 'my-game', SESSION, 'v3', []);
    clearRecoveryReady(dir);
    expect(isRecoveryReady(dir, 'my-game')).toBe(false);
  });
});

describe('writing the recovery marker', () => {
  it('leaves no scratch file behind', () => {
    const dir = root();
    markRecoveryReady(dir, 'my-game', SESSION, 'v3', ['SPEC.md']);
    expect(readdirSync(dir)).toEqual([MARKER]);
  });

  it('keeps the previous marker when the write fails', () => {
    const dir = root();
    markRecoveryReady(dir, 'my-game', SESSION, 'v3', ['SPEC.md']);
    const before = readFileSync(join(dir, MARKER), 'utf8');
    // Occupying the scratch path proves the target is never opened first.
    const scratch = join(dir, `${MARKER}.${process.pid}.tmp`);
    mkdirSync(scratch);
    expect(() => markRecoveryReady(dir, 'my-game', SESSION, 'v4', ['SPEC.md', 'GAME.json'])).toThrow();
    expect(readFileSync(join(dir, MARKER), 'utf8')).toBe(before);
    expect(isRecoveryReady(dir, 'my-game')).toBe(true);
    expect(existsSync(scratch)).toBe(false);
  });
});
