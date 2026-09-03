import { describe, expect, it } from 'vitest';
import { formatLoadBytes, readResponseBody, responseByteTotal } from './fetchProgress.js';

describe('responseByteTotal', () => {
  it('reads Content-Length when the body is not compressed', () => {
    expect(responseByteTotal(new Headers({ 'content-length': '4096' }))).toBe(4096);
  });

  it('ignores Content-Length when gzip would desync loaded vs total', () => {
    expect(
      responseByteTotal(
        new Headers({
          'content-length': '800',
          'content-encoding': 'gzip',
        }),
      ),
    ).toBeNull();
  });

  it('rejects missing or non-positive lengths', () => {
    expect(responseByteTotal(new Headers())).toBeNull();
    expect(responseByteTotal(new Headers({ 'content-length': '0' }))).toBeNull();
    expect(responseByteTotal(new Headers({ 'content-length': 'nope' }))).toBeNull();
  });
});

describe('formatLoadBytes', () => {
  it('picks B, KB, or MB by magnitude', () => {
    expect(formatLoadBytes(400)).toBe('400 B');
    expect(formatLoadBytes(12 * 1024)).toBe('12 KB');
    expect(formatLoadBytes(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(formatLoadBytes(24 * 1024 * 1024)).toBe('24 MB');
  });
});

describe('readResponseBody', () => {
  it('reports chunked progress against Content-Length', async () => {
    const payload = 'abcdefghij'.repeat(10);
    const encoded = new TextEncoder().encode(payload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 40));
        controller.enqueue(encoded.slice(40));
        controller.close();
      },
    });
    const updates: Array<{ loaded: number; total: number | null }> = [];
    const text = await readResponseBody(
      new Response(stream, { headers: { 'content-length': String(encoded.byteLength) } }),
      (progress) => updates.push(progress),
    );
    expect(text).toBe(payload);
    expect(updates[0]).toEqual({ loaded: 40, total: encoded.byteLength });
    expect(updates.at(-1)).toEqual({ loaded: encoded.byteLength, total: encoded.byteLength });
  });

  it('drops total when decoded bytes overrun the declared length', async () => {
    const encoded = new TextEncoder().encode('hello-world');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });
    const updates: Array<{ loaded: number; total: number | null }> = [];
    await readResponseBody(new Response(stream, { headers: { 'content-length': '4' } }), (progress) =>
      updates.push(progress),
    );
    expect(updates.some((update) => update.total === null)).toBe(true);
    expect(updates.at(-1)?.total).toBeNull();
    expect(updates.at(-1)?.loaded).toBe(encoded.byteLength);
  });

  it('still returns the body when no listener is given', async () => {
    await expect(readResponseBody(new Response('{"ok":true}'))).resolves.toBe('{"ok":true}');
  });
});
