import { describe, expect, it, vi } from 'vitest';
import { flushLanguageFileUpdates, queueLanguageFileUpdate } from './codeSurfaceLanguageBind.js';

describe('codeSurfaceLanguageBind', () => {
  it('queues updates until a service exists, then flushes in order', () => {
    const pending = new Map<string, string | null>();
    queueLanguageFileUpdate(pending, null, 'gone.ts', null);
    queueLanguageFileUpdate(pending, null, 'game.ts', 'export {};\n');
    const service = { updateFile: vi.fn(), deleteFile: vi.fn() };
    flushLanguageFileUpdates(pending, service);
    expect(service.deleteFile).toHaveBeenCalledWith('gone.ts');
    expect(service.updateFile).toHaveBeenCalledWith('game.ts', 'export {};\n');
    expect(pending.size).toBe(0);
    queueLanguageFileUpdate(pending, service, 'sim.ts', 'export const tick = () => {};\n');
    expect(service.updateFile).toHaveBeenCalledWith('sim.ts', 'export const tick = () => {};\n');
    expect(pending.size).toBe(0);
  });

  it('coalesces repeated edits to the same path into one pending entry', () => {
    const pending = new Map<string, string | null>();
    queueLanguageFileUpdate(pending, null, 'game.ts', 'v1');
    queueLanguageFileUpdate(pending, null, 'game.ts', 'v2');
    queueLanguageFileUpdate(pending, null, 'game.ts', 'v3');
    expect(pending.size).toBe(1);
    const service = { updateFile: vi.fn(), deleteFile: vi.fn() };
    flushLanguageFileUpdates(pending, service);
    expect(service.updateFile).toHaveBeenCalledTimes(1);
    expect(service.updateFile).toHaveBeenCalledWith('game.ts', 'v3');
  });

  it('caps pending updates and evicts the oldest untouched path first', () => {
    const pending = new Map<string, string | null>();
    const cap = 500;
    const overflow = cap + 50;
    for (let i = 0; i < overflow; i++) {
      queueLanguageFileUpdate(pending, null, `file-${i}.ts`, `content-${i}`);
    }
    expect(pending.size).toBe(cap);
    expect(pending.has('file-0.ts')).toBe(false);
    expect(pending.has(`file-${overflow - 1}.ts`)).toBe(true);
    expect(pending.get(`file-${overflow - 1}.ts`)).toBe(`content-${overflow - 1}`);
  });
});
