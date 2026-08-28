import { describe, expect, it, vi } from 'vitest';
import { flushLanguageFileUpdates, queueLanguageFileUpdate } from './codeSurfaceLanguageBind.js';

describe('codeSurfaceLanguageBind', () => {
  it('queues updates until a service exists, then flushes in order', () => {
    const pending: Array<{ path: string; content: string | null }> = [];
    queueLanguageFileUpdate(pending, null, 'gone.ts', null);
    queueLanguageFileUpdate(pending, null, 'game.ts', 'export {};\n');
    const service = { updateFile: vi.fn(), deleteFile: vi.fn() };
    flushLanguageFileUpdates(pending, service);
    expect(service.deleteFile).toHaveBeenCalledWith('gone.ts');
    expect(service.updateFile).toHaveBeenCalledWith('game.ts', 'export {};\n');
    expect(pending).toEqual([]);
    queueLanguageFileUpdate(pending, service, 'sim.ts', 'export const tick = () => {};\n');
    expect(service.updateFile).toHaveBeenCalledWith('sim.ts', 'export const tick = () => {};\n');
    expect(pending).toEqual([]);
  });
});
