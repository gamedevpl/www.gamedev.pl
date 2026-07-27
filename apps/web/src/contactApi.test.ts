import { describe, expect, it, vi } from 'vitest';
import { submitContact } from './contactApi';

describe('submitContact', () => {
  it('POSTs the payload to /api/contact', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));

    await submitContact({
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hello there, enough characters.',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/contact',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Ada',
          email: 'ada@example.com',
          message: 'Hello there, enough characters.',
        }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('surfaces the API error message and status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'content_rejected', category: 'profanity' }), { status: 422 }),
    );

    await expect(
      submitContact({ name: 'Ada', email: 'ada@example.com', message: 'Hello there, enough characters.' }),
    ).rejects.toMatchObject({ message: 'content_rejected', status: 422, category: 'profanity' });
    vi.restoreAllMocks();
  });
});
