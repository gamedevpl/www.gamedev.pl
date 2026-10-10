import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { isJsonContentType } from './workbench-http.js';
import {
  codeProjectId,
  readCodeFile,
  readCodeProject,
  saveCodeFile,
  type CodeCheckout,
} from './workbench-code-files.js';
import { codeCompletion, CODE_PROVIDERS } from './workbench-code-completion.js';
import { PLAY_CODE_WORKER } from './generated/play-code-worker.js';

export type CodeOptions = { checkout?: () => CodeCheckout | null; env?: NodeJS.ProcessEnv };
const projectRequest = z.object({ projectId: z.string().regex(/^[a-f0-9]{64}$/), path: z.string().min(1).max(240) });

export function codeRoutes(options: CodeOptions) {
  const completion = codeCompletion(options.env ?? {});
  let observedProject = '';
  const route = async (
    req: IncomingMessage,
    origin: string,
    body: (req: IncomingMessage, limit?: number) => Promise<unknown>,
    reply: (status: number, value: unknown) => void,
  ): Promise<boolean> => {
    if (!req.url?.startsWith('/code/')) return false;
    const checkout = options.checkout?.();
    const projectId = checkout ? codeProjectId(checkout) : '';
    if (observedProject !== projectId) {
      completion.select(null, false);
      observedProject = projectId;
    }
    if (!checkout) {
      reply(404, { error: 'Open a local checkout to edit code' });
      return true;
    }
    if (req.method === 'GET' && req.url === '/code/worker') {
      reply(200, { script: PLAY_CODE_WORKER });
      return true;
    }
    if (req.method === 'GET' && req.url === '/code/project') {
      reply(200, { ...readCodeProject(checkout), completion: completion.status() });
      return true;
    }
    if (req.method !== 'POST' || req.headers.origin !== origin || !isJsonContentType(req.headers['content-type'])) {
      reply(403, { error: 'JSON and same-origin required' });
      return true;
    }
    const currentId = codeProjectId(checkout);
    const current = () => {
      const latest = options.checkout?.();
      return Boolean(latest && codeProjectId(latest) === currentId);
    };
    if (req.url === '/code/save') {
      const request = projectRequest
        .extend({ version: z.string().regex(/^[a-f0-9]{64}$/), content: z.string().max(1_000_000) })
        .strict()
        .parse(await body(req, 6_100_000));
      if (request.projectId !== currentId) {
        reply(409, { status: 'conflict' });
        return true;
      }
      try {
        const result = await saveCodeFile(checkout, request, current);
        reply(result.status === 'saved' ? 200 : 409, result);
      } catch {
        reply(409, { status: 'conflict', error: 'Checkout busy or file unavailable. Your draft is preserved.' });
      }
      return true;
    }
    if (req.url === '/code/completion/settings') {
      const request = z
        .object({ projectId: z.string(), provider: z.enum(CODE_PROVIDERS).nullable(), consent: z.boolean() })
        .strict()
        .parse(await body(req));
      if (request.projectId !== currentId) {
        reply(409, { error: 'Project changed' });
        return true;
      }
      reply(200, completion.select(request.provider, request.consent));
      return true;
    }
    if (req.url === '/code/completion') {
      const request = projectRequest
        .extend({ prefix: z.string().max(3000), suffix: z.string().max(1200) })
        .strict()
        .parse(await body(req));
      if (request.projectId !== currentId || readCodeFile(checkout, request.path).readOnly) {
        reply(409, { error: 'Project changed or read-only file' });
        return true;
      }
      const abort = new AbortController();
      const disconnect = () => abort.abort();
      req.socket.once('close', disconnect);
      try {
        const text = await completion.complete(request.prefix, request.suffix, abort.signal);
        reply(current() ? 200 : 409, current() ? { text } : { error: 'Project changed' });
      } finally {
        req.socket.off('close', disconnect);
      }
      return true;
    }
    reply(404, { error: 'Not found' });
    return true;
  };
  return { route, close: completion.close };
}
