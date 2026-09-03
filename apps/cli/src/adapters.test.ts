import { describe, expect, it } from 'vitest';
import { loadAdapters, detectAdapter } from './adapters.js';

describe('adapter registry', () => {
  it('ships the blessed four as data', () => {
    const file = loadAdapters({ HOME: '/tmp/does-not-exist-gamedev' });
    expect(file.adapters.map((row) => row.name).sort()).toEqual(['claude', 'codex', 'gemini', 'vibe']);
  });

  it('detects only adapters present on PATH', () => {
    const file = loadAdapters({ HOME: '/tmp/does-not-exist-gamedev' });
    expect(detectAdapter('claude', () => '/usr/bin/claude', file)?.command).toBe('claude');
    expect(detectAdapter('claude', () => null, file)).toBeNull();
  });
});
