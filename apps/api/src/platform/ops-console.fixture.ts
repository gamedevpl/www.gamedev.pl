// Test door into operator routes: what the ops console sends, minus Google.
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { InternalAuthVerifier } from './internal-auth.js';
import { OPERATOR_HEADER, OPS_PREFIX } from './ops-console.js';

export const OPS_TEST_BEARER = 'Bearer ops-console-test-token';

export const opsTestVerifier: InternalAuthVerifier = {
  async verify(header) {
    return header === OPS_TEST_BEARER;
  },
};

// Rewrites an /api path onto the ops door, like the console.
export function opsUrl(url: string): string {
  return OPS_PREFIX + url.replace(/^\/api/, '');
}

export function opsHeaders(uid: string): Record<string, string> {
  return { authorization: OPS_TEST_BEARER, [OPERATOR_HEADER]: uid };
}

export function opsInject(
  app: FastifyInstance,
  uid: string,
  request: { method: InjectOptions['method']; url: string; payload?: InjectOptions['payload'] },
) {
  return app.inject({ ...request, url: opsUrl(request.url), headers: opsHeaders(uid) });
}
