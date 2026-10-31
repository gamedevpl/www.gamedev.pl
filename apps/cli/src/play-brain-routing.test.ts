import { expect, it, vi } from 'vitest';
import { selectPublishedPlayAgent } from './play-brain-routing.js';
import type { Workshop } from './workshop.js';

it('offers only Play-capable agents and rejects an unsupported selection', async () => {
  const ws = { adapters: [{ name: 'claude' }, { name: 'codex' }, { name: 'vibe' }] } as Workshop;
  const prompt = vi.fn(async () => 'vibe');
  const write = vi.fn();
  expect(await selectPublishedPlayAgent(ws, prompt, write)).toBe(false);
  expect(prompt).toHaveBeenCalledWith(['claude', 'codex', 'Cancel'], expect.any(String));
  expect(ws.selectedAgent).toBeUndefined();
  expect(write).toHaveBeenCalledWith(expect.stringContaining('not started'));
});
