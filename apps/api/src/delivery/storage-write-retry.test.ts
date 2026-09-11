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
it('does not retry earlier than a long Retry-After', async () => {
  const send = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '60' } }));
  await expect(retryStorageWrite(send)).rejects.toBeInstanceOf(StorageWriteBusyError);
  expect(send).toHaveBeenCalledTimes(1);
});
