import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closedBetaWall, describeError, formatError, pipeNeedsFlag, quotaExhausted } from './errors.js';
import { EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';

describe('error UX', () => {
  it('names a next action for closed-beta, quota, and pipe', () => {
    expect(closedBetaWall(3).message).toContain('#3');
    expect(quotaExhausted().exitCode).toBe(EXIT_REFUSED);
    expect(pipeNeedsFlag('--agent').exitCode).toBe(EXIT_INPUT);
    expect(describeError(pipeNeedsFlag('--yes')).next).toBe('--yes');
    expect(formatError(pipeNeedsFlag('--yes'))).toContain('next: --yes');
  });

  it.each([
    "Cannot read properties of undefined (reading 'version')",
    'Failed to parse URL from not-a-url',
    'Invalid URL',
  ])('preserves a TypeError without claiming a network failure: %s', (message) => {
    expect(describeError(new TypeError(message))).toEqual({ message, code: EXIT_REFUSED });
  });

  it('reports a fetch failure without guessing that a proxy or sandbox blocked it', () => {
    const cause = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    expect(describeError(new TypeError('fetch failed', { cause }))).toEqual({
      message: 'network request failed (ECONNREFUSED) — check the connection and try again',
      next: 'gamedevpl whoami',
      code: EXIT_REFUSED,
    });
    expect(describeError(new TypeError('fetch failed')).message).toBe(
      'network request failed — check the connection and try again',
    );
  });

  it('identifies an actual fetch transport failure but preserves an invalid URL error', async () => {
    const server = createServer((request) => request.socket.destroy());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const error = await fetch(`http://127.0.0.1:${port}/`).catch((error: unknown) => error);
      expect(describeError(error).message).toContain('network request failed (UND_ERR_SOCKET)');
      const invalid = await fetch('not-a-url').catch((error: unknown) => error);
      expect(describeError(invalid)).toEqual({
        message: 'Failed to parse URL from not-a-url',
        code: EXIT_REFUSED,
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
