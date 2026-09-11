import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadAdapters } from './adapters.js';
import { configureAdapter, readAgentSelection, saveAgentSelection, selectionLabel } from './agent-settings.js';
import { modelCommand } from './model-command.js';

it('persists each agent independently and translates Codex and Muse controls', () => {
  const HOME = mkdtempSync(join(tmpdir(), 'gdpl-model-'));
  try {
    const env = { HOME };
    saveAgentSelection('codex', { model: 'chosen-model', effort: 'high' }, env);
    const adapters = loadAdapters(env).adapters;
    const spec = configureAdapter(
      adapters.find((row) => row.name === 'codex')!,
      env,
    );
    expect(spec.headless.slice(0, 5)).toEqual([
      'exec',
      '--model',
      'chosen-model',
      '-c',
      'model_reasoning_effort="high"',
    ]);
    expect(spec.headless).toContain('--json');
    expect(readAgentSelection('muse', env)).toEqual({});
    const muse = configureAdapter(
      adapters.find((row) => row.name === 'muse')!,
      env,
      { model: 'another', effort: 'low' },
    );
    expect(muse.headless).toContain('--reasoning-effort');
    expect(muse.headless).toContain('--trust-workspace');
    expect(selectionLabel('codex', {})).toContain('not reported');
  } finally {
    rmSync(HOME, { recursive: true, force: true });
  }
});
it('supports an interactive model/effort choice and resetting to native defaults', async () => {
  const HOME = mkdtempSync(join(tmpdir(), 'gdpl-model-ui-'));
  try {
    const replies = ['Change model and effort', 'my-model', 'medium'];
    await modelCommand({
      args: ['muse'],
      flags: {},
      env: { HOME },
      pick: async () => replies.shift()!,
      write: () => {},
    });
    expect(readAgentSelection('muse', { HOME })).toEqual({ model: 'my-model', effort: 'medium' });
    await modelCommand({ args: ['muse'], flags: { reset: true }, env: { HOME }, write: () => {} });
    expect(readAgentSelection('muse', { HOME })).toEqual({});
    await expect(
      modelCommand({ args: ['vibe'], flags: { effort: 'high' }, env: { HOME }, write: () => {} }),
    ).rejects.toThrow('does not support effort');
    expect(() => saveAgentSelection('codex', { model: '--override' }, { HOME })).toThrow('invalid model');
  } finally {
    rmSync(HOME, { recursive: true, force: true });
  }
});

it('replaces pinned adapter flags without dropping execution or sandbox flags', () => {
  const HOME = mkdtempSync(join(tmpdir(), 'gdpl-model-flags-'));
  try {
    const spec = loadAdapters({ HOME }).adapters.find((row) => row.name === 'codex')!;
    const configured = configureAdapter(
      {
        ...spec,
        headless: [
          'exec',
          '--model',
          'old',
          '-c',
          'model_reasoning_effort="low"',
          '--json',
          '--sandbox',
          'workspace-write',
        ],
      },
      { HOME },
      { model: 'new', effort: 'high' },
    );
    expect(configured.headless).not.toContain('old');
    expect(configured.headless).not.toContain('model_reasoning_effort="low"');
    expect(configured.headless).toContain('workspace-write');
    expect(configured.headless).toContain('model_reasoning_effort="high"');
  } finally {
    rmSync(HOME, { recursive: true, force: true });
  }
});
