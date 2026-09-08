import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapters, detectAdapter, preflightAdapter } from './adapters.js';

describe('adapter registry', () => {
  it('ships local adapters for all supported agents', () => {
    const file = loadAdapters({ HOME: '/tmp/does-not-exist-gamedev' });
    expect(file.adapters.map((row) => row.name).sort()).toEqual([
      'agy',
      'claude',
      'codex',
      'copilot',
      'cursor',
      'gemini',
      'muse',
      'vibe',
    ]);
  });

  it('detects only adapters present on PATH', () => {
    const file = loadAdapters({ HOME: '/tmp/does-not-exist-gamedev' });
    expect(detectAdapter('claude', () => '/usr/bin/claude', file)?.command).toBe('claude');
    expect(detectAdapter('claude', () => null, file)).toBeNull();
  });
});

it('validates flags even when a CLI exits before its output pipe flushes', () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-help-'));
  const command = join(root, 'fixture');
  const base = loadAdapters({ HOME: root }).adapters[0]!;
  try {
    writeFileSync(
      command,
      `#!${process.execPath}\nprocess.stdout.write('x'.repeat(20000) + ' --required'); process.exit(0);`,
      { mode: 0o700 },
    );
    expect(() => preflightAdapter({ ...base, command, headless: ['--required'] }, process.env)).not.toThrow();
    expect(() => preflightAdapter({ ...base, command, headless: ['--missing'] }, process.env)).toThrow(
      'does not support --missing',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('probes Muse exec help without starting a paid session', () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-muse-help-'));
  const command = join(root, 'muse');
  const spec = loadAdapters({ HOME: root }).adapters.find((row) => row.name === 'muse')!;
  try {
    writeFileSync(
      command,
      `#!${process.execPath}\nif (process.argv.slice(2).join(' ') !== 'exec --help') process.exit(1); console.log('--trust-workspace');`,
      { mode: 0o700 },
    );
    expect(() => preflightAdapter({ ...spec, command }, process.env)).not.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
