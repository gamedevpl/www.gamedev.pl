import { describe, expect, it, vi } from 'vitest';
import { createPusherFromEnv, NoopPusher, WebPushPusher } from './pusher.js';

const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
const payload = { title: 'Hi', body: 'Body', url: 'https://www.gamedev.pl/play/x', tag: 'sub-1-published' };

function pusherWith(sendImpl: (...args: unknown[]) => Promise<unknown>) {
  // Injected sender keeps the test free of the real web-push module (no crypto,
  // no network) — same discipline as the mailer's fetchImpl.
  return new WebPushPusher({
    publicKey: 'pub',
    privateKey: 'priv',
    subject: 'mailto:x@y.z',
    sendImpl: sendImpl as never,
  });
}

describe('WebPushPusher', () => {
  it('reports sent on success and forwards the VAPID details', async () => {
    const sendImpl = vi.fn().mockResolvedValue(undefined);
    const res = await pusherWith(sendImpl).send(sub, payload);
    expect(res).toEqual({ outcome: 'sent' });
    expect(sendImpl).toHaveBeenCalledWith(
      sub,
      JSON.stringify(payload),
      expect.objectContaining({
        vapidDetails: { subject: 'mailto:x@y.z', publicKey: 'pub', privateKey: 'priv' },
      }),
    );
  });

  it.each([404, 410])('reports gone on %i so the caller prunes', async (status) => {
    const sendImpl = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { statusCode: status });
    });
    expect(await pusherWith(sendImpl).send(sub, payload)).toEqual({ outcome: 'gone' });
  });

  it('reports a transient error (not gone) on other failures', async () => {
    const sendImpl = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { statusCode: 500 });
    });
    expect(await pusherWith(sendImpl).send(sub, payload)).toEqual({ outcome: 'error', status: 500 });
  });
});

describe('NoopPusher', () => {
  it('records without sending and always reports sent', async () => {
    const pusher = new NoopPusher();
    expect(await pusher.send(sub, payload)).toEqual({ outcome: 'sent' });
    expect(pusher.sent).toHaveLength(1);
    expect(pusher.sent[0].payload.tag).toBe('sub-1-published');
  });
});

describe('createPusherFromEnv', () => {
  it('returns a real pusher only when both VAPID keys are present', () => {
    expect(createPusherFromEnv({})).toBeUndefined();
    expect(createPusherFromEnv({ VAPID_PUBLIC_KEY: 'pub' })).toBeUndefined();
    const pusher = createPusherFromEnv({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    expect(pusher?.name).toBe('web-push');
  });
});
