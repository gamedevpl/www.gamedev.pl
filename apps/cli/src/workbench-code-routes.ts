import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { isJsonContentType } from './workbench-http.js';
import { codeProjectId, readCodeFile, saveCodeFile, type CodeCheckout } from './workbench-code-files.js';
import {
  codeCompletion,
  CODE_PROVIDERS,
  CodeCompletionError,
  type PlatformCompletion,
} from './workbench-code-completion.js';
import { loadCodeWorker } from './workbench-code-worker.js';
import { readCodeIndex } from './workbench-code-index.js';
import { codeTelemetry } from './workbench-code-telemetry.js';

export type CodeOptions = {
  checkout?: () => CodeCheckout | null;
  env?: NodeJS.ProcessEnv;
  platform?: PlatformCompletion;
};
const projectRequest = z.object({ projectId: z.string().regex(/^[a-f0-9]{64}$/), path: z.string().min(1).max(240) });

export function codeRoutes(options: CodeOptions) {
  const completion = codeCompletion(options.env ?? {}, undefined, options.platform);
  const telemetry = codeTelemetry(options.platform?.api.origin);
  let observedProject = '';
  let worker: Promise<string> | undefined;
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
      worker ??= loadCodeWorker({ env: options.env }).catch((error: unknown) => {
        worker = undefined;
        throw error;
      });
      reply(200, { script: await worker });
      return true;
    }
    if (req.method === 'GET' && req.url === '/code/project') {
      reply(200, { ...(await readCodeIndex(checkout)), completion: await completion.refresh() });
      return true;
    }
    if (req.method !== 'POST' || req.headers.origin !== origin || !isJsonContentType(req.headers['content-type'])) {
      reply(403, { error: 'JSON and same-origin required' });
      return true;
    }
    const currentId = codeProjectId(checkout);
    if (req.url === '/code/telemetry') {
      telemetry(await body(req));
      reply(202, { ok: true });
      return true;
    }
    const current = () => {
      const latest = options.checkout?.();
      return Boolean(latest && codeProjectId(latest) === currentId);
    };
    if (req.url === '/code/file') {
      const request = projectRequest.strict().parse(await body(req));
      if (request.projectId !== currentId) reply(409, { error: 'Project changed' });
      else {
        try {
          reply(200, { file: readCodeFile(checkout, request.path) });
        } catch {
          reply(415, { error: 'File is unavailable, unsafe, too large or not UTF-8 text' });
        }
      }
      return true;
    }
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
        const text = await completion.complete(
          request.prefix,
          request.suffix,
          abort.signal,
          request.path.slice(`games/${checkout.slug}/`.length),
        );
        reply(current() ? 200 : 409, current() ? { text } : { error: 'Project changed' });
      } catch (error) {
        if (error instanceof CodeCompletionError) reply(error.status, { error: error.message });
        else throw error;
      } finally {
        req.socket.off('close', disconnect);
      }
      return true;
    }
    reply(404, { error: 'Not found' });
    return true;
  };
  return {
    route: async (...args: Parameters<typeof route>) => {
      try {
        return await route(...args);
      } catch (error) {
        args[3](error instanceof CodeCompletionError ? error.status : error instanceof z.ZodError ? 400 : 503, {
          error:
            error instanceof CodeCompletionError
              ? error.message
              : error instanceof z.ZodError
                ? 'Invalid editor request'
                : 'Editor request unavailable. Check the checkout and retry; drafts are preserved.',
        });
        return true;
      }
    },
    close: completion.close,
  };
}
