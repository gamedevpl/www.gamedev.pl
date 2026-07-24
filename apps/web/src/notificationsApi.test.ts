import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNotifications, markNotificationsRead } from './notificationsApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchNotifications', () => {
  it('returns the notifications array from the response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ notifications: [{ id: 'sub-1-published' }] }), { status: 200 }),
    );
    const list = await fetchNotifications();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('sub-1-published');
  });

  it('sends credentials so the session cookie authenticates', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ notifications: [] }), { status: 200 }));
    await fetchNotifications();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('/api/notifications'), { credentials: 'include' });
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(fetchNotifications()).rejects.toThrow(/401/);
  });

  it('tolerates a malformed body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    expect(await fetchNotifications()).toEqual([]);
  });
});

describe('markNotificationsRead', () => {
  it('POSTs { all: true } for the all case', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await markNotificationsRead('all');
    const [, init] = spy.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ all: true });
  });

  it('POSTs specific ids', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await markNotificationsRead(['a', 'b']);
    const [, init] = spy.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ ids: ['a', 'b'] });
  });
});
