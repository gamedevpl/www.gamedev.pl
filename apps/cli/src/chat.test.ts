import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api.js';
import { postCliChat } from './chat.js';

describe('assistant agent metadata', () => {
  it('preserves custom names and bounds optional metadata without mutating adapters', async () => {
    const request = vi.fn(async () => ({ kind: 'reply', text: 'ok', conversationId: 'c' }));
    const agents = [
      'Claude_Custom',
      'My Agent (local)',
      'Żółw.dev',
      '',
      'x'.repeat(41),
      ...Array.from({ length: 30 }, (_, index) => `agent_${index}`),
    ];
    const original = [...agents];
    await postCliChat({ request } as unknown as ApiClient, 'hello', undefined, false, { agents });
    expect(request).toHaveBeenCalledWith('POST', '/api/cli/chat', {
      text: 'hello',
      session: {
        agents: [
          'Claude_Custom',
          'My Agent (local)',
          'Żółw.dev',
          ...Array.from({ length: 17 }, (_, index) => `agent_${index}`),
        ],
      },
    });
    expect(agents).toEqual(original);
  });
});
