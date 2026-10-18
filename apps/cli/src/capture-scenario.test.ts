import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScenario, readGameCapturePlan, selectScenario } from './capture-scenario.js';

it('selects nested marks, preserves seed, and freezes an inline plan independently of CAPTURE.json', () => {
  const raw = { seed: 42, fps: 30, maxFrames: 60, script: [{ repeat: { times: 2, actions: [{ capture: 'view' }] } }] };
  const stored = selectScenario({ mark: 'view' }, () => ({ ...raw, film: { from: 0, to: 60 } }))!;
  const inline = selectScenario({ mark: 'view', plan: raw }, () => {
    throw new Error('must not read');
  })!;
  expect(stored).toMatchObject({ source: 'CAPTURE.json', mark: 'view', plan: { seed: 42 } });
  expect(inline.hash).toBe(stored.hash);
  raw.script[0]!.repeat.times = 3;
  expect(inline.plan.script[0]).toMatchObject({ repeat: { times: 2 } });
  expect(selectScenario({})).toBeUndefined();
  expect(selectScenario({ plan: { script: [{ wait: 10 }] } })?.plan).toMatchObject({
    seed: 1,
    fps: 30,
    maxFrames: 3600,
  });
});

it('returns available markers and does not silently fall back to the initial state', () => {
  const read = () => ({ script: [{ capture: 'opening' }, { capture: 'finish' }] });
  expect(() => selectScenario({ mark: 'typo' }, read)).toThrow('Available: opening, finish');
  expect(() => selectScenario({ mark: 'opening' })).toThrow('Supply an inline plan');
});

it.each([
  { script: [{ evaluate: 'process.exit()' }] },
  { script: [{ wait: 1, tap: 'a' }] },
  { script: [{ tap: { key: 'a', code: 'KeyA', command: 'exec' } }] },
  { script: [{ click: { x: 2, y: 0 } }] },
  { script: [{ assert: { field: 'x', equals: 1, notEquals: 0 } }] },
  { script: [{ waitFor: { field: 'x', equals: 1 } }] },
  { script: [{ press: { key: 'a', frames: 0 } }] },
  { script: [{ repeat: { times: 500, actions: [{ repeat: { times: 500, actions: [{ wait: 0 }] } }] } }] },
  { fps: 1, maxFrames: 601, script: [{ wait: 1 }] },
  { seed: -1, script: [{ wait: 1 }] },
  { url: 'file:///etc/passwd', script: [{ wait: 1 }] },
])('rejects executable, ambiguous or unbounded plans: %j', (raw) => {
  expect(() => parseScenario(raw)).toThrow();
});

it('bounds nesting before recursive schema validation', () => {
  let action: unknown = { wait: 0 };
  for (let i = 0; i < 100; i++) action = { repeat: { times: 1, actions: [action] } };
  expect(() => parseScenario({ script: [action] })).toThrow('deeply nested');
});

it('reads only the bound game CAPTURE.json and refuses symlinks and oversized files', () => {
  const root = mkdtempSync(join(tmpdir(), 'capture-plan-'));
  try {
    const game = join(root, 'games/demo');
    mkdirSync(game, { recursive: true });
    const path = join(game, 'CAPTURE.json');
    writeFileSync(path, '{"script":[{"capture":"opening"}]}');
    expect(readGameCapturePlan(root, 'demo')).toEqual({ script: [{ capture: 'opening' }] });
    writeFileSync(path, ' '.repeat(65_537));
    expect(() => readGameCapturePlan(root, 'demo')).toThrow('64 KiB');
    rmSync(path);
    writeFileSync(join(root, 'secret.json'), '{}');
    symlinkSync(join(root, 'secret.json'), path);
    expect(() => readGameCapturePlan(root, 'demo')).toThrow(/symbolic link/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
