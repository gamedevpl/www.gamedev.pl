import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitPlayerFeedback } from './playerFeedbackApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('submitPlayerFeedback', () => {
  it('POSTs the text with credentials to the slug-keyed endpoint', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await submitPlayerFeedback('brick-storm', 'Level two is way harder than level one.');

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/games/brick-storm/feedback');
    expect(init?.credentials).toBe('include');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ text: 'Level two is way harder than level one.' });
  });

  it('throws with the server error and category on a non-ok response', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ error: 'content_rejected', category: 'pii' }), { status: 422 }));
    await expect(submitPlayerFeedback('brick-storm', 'contact me at me@example.com')).rejects.toMatchObject({
      message: 'content_rejected',
      status: 422,
      category: 'pii',
    });
    expect(spy).toHaveBeenCalled();
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 500 }));
    await expect(submitPlayerFeedback('brick-storm', 'some feedback text')).rejects.toThrow(/500/);
  });
});
