import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { SESSION_BROWSER_SCRIPT } from './session-browser-script.js';

it('keeps evidence staged after acceptance and resends it with a clarification answer', async () => {
  const fields = new Map<string, { textContent: string }>();
  const attachments = [{ id: 'image' }, { id: 'trace' }];
  const api = vi.fn(async () => ({ status: 'accepted' }));
  const draft = { value: 'Fix this image' };
  const state = { sessionId: 'session', promptId: 1, mode: 'prompt' };
  const context = {
    api,
    draft,
    state,
    attachments,
    online: true,
    pending: undefined,
    sending: false,
    crypto: { randomUUID: () => 'command-' + api.mock.calls.length },
    sessionStorage: { setItem: vi.fn(), removeItem: vi.fn() },
    controls: () => {},
    tray: () => {},
    el: (id: string) => {
      if (!fields.has(id)) fields.set(id, { textContent: '' });
      return fields.get(id);
    },
  };
  const start = SESSION_BROWSER_SCRIPT.indexOf('async function deliver()');
  const end = SESSION_BROWSER_SCRIPT.indexOf("el('composer').onsubmit", start);
  runInNewContext(SESSION_BROWSER_SCRIPT.slice(start, end), context);
  const client = context as typeof context & { send(command: unknown): void };
  client.send({ kind: 'input', promptId: 1, text: draft.value });
  await vi.waitFor(() => expect(context.pending).toBeUndefined());
  expect(context.attachments).toEqual(attachments);
  expect(draft.value).toBe('');
  state.promptId = 2;
  draft.value = 'Make the car red';
  client.send({ kind: 'input', promptId: 2, text: draft.value });
  await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(api.mock.calls[1]).toEqual([
    '/commands',
    expect.objectContaining({
      command: expect.objectContaining({ text: 'Make the car red', attachments: ['image', 'trace'] }),
    }),
  ]);
});
