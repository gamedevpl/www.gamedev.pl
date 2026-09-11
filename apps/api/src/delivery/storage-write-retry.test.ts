import { afterEach, expect, it, vi } from 'vitest';
import { retryStorageWrite, StorageWriteBusyError } from './storage-write-retry.js';

afterEach(() => vi.useRealTimers());
it('backs off on throttling and returns the successful response', async () => {
  vi.useFakeTimers();
  const send = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
    .mockResolvedValueOnce(new Response('{}'));
  const pending = retryStorageWrite(send);
  await vi.advanceTimersByTimeAsync(1999);
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect((await pending).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
});
it('bounds retries and returns a safe, actionable error', async () => {
  vi.useFakeTimers();
  const send = vi.fn(() => Promise.resolve(new Response('', { status: 429 })));
  const check = expect(retryStorageWrite(send)).rejects.toBeInstanceOf(StorageWriteBusyError);
  await vi.runAllTimersAsync();
  await check;
  expect(send).toHaveBeenCalledTimes(4);
});
it.each([400, 403, 412, 500])('leaves status %i to the caller without retrying', async (status) => {
  const send = vi.fn(async () => new Response('', { status }));
  expect((await retryStorageWrite(send)).status).toBe(status);
  expect(send).toHaveBeenCalledTimes(1);
});
it.each(['seconds', 'date'])('preserves a long Retry-After expressed as %s', async (format) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
  const after = format === 'seconds' ? '60' : 'Fri, 11 Sep 2026 12:01:00 GMT';
  const send = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': after } }));
  await expect(retryStorageWrite(send)).rejects.toMatchObject({ retryAfterSeconds: 60 });
  expect(send).toHaveBeenCalledTimes(1);
});
it('preserves Retry-After when the retry budget is exhausted', async () => {
  vi.useFakeTimers();
  const send = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '8' } }));
  const check = expect(retryStorageWrite(send)).rejects.toMatchObject({ retryAfterSeconds: 8 });
  await vi.runAllTimersAsync();
  await check;
  expect(send).toHaveBeenCalledTimes(4);
});
