import { randomBytes } from 'node:crypto';
import { AsyncResource } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { realpathSync } from 'node:fs';
import type { PushResult } from './git-remote.js';

const URL_ENV = 'GAMEDEVPL_PLAY_PUSH_URL';
const TOKEN_ENV = 'GAMEDEVPL_PLAY_PUSH_TOKEN';
const PATH = '/agent/git-push';

export function playTurnWriter() {
  const reenter = AsyncResource.bind((run: () => Promise<unknown>) => run());
  let pending: Promise<unknown> = Promise.resolve();
  return {
    run<T>(run: () => Promise<T>): Promise<T> {
      const result = pending.then(() => reenter(run)) as Promise<T>;
      pending = result.catch(() => {});
      return result;
    },
    finish: () => pending,
  };
}

export function playPushBridge(
  env: NodeJS.ProcessEnv,
  root: string,
  slug: string,
  push: (remote: string, srcRef: string) => Promise<PushResult>,
) {
  const canonical = realpathSync(root);
  delete env[URL_ENV];
  delete env[TOKEN_ENV];
  let turn: { token: string; url: string } | undefined;
  const pending = new Set<Promise<void>>();
  let busy = false;
  const reply = (res: ServerResponse, status: number, result: PushResult) => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(result));
  };
  const receive = async (req: IncomingMessage, res: ServerResponse, owner: NonNullable<typeof turn>) => {
    req.setTimeout(10_000, () => req.destroy());
    try {
      let body = '';
      for await (const chunk of req) {
        body += String(chunk);
        if (Buffer.byteLength(body) > 4096) throw Error('Git push request is too large.');
      }
      req.setTimeout(0);
      if (turn !== owner) throw Error('The Play turn has ended.');
      const { remote, srcRef, game, cwd } = JSON.parse(body) as Record<string, unknown>;
      if (
        typeof remote !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(remote) ||
        typeof srcRef !== 'string' ||
        !srcRef ||
        srcRef.length > 1024 ||
        game !== slug ||
        cwd !== canonical
      )
        throw Error('Invalid Git push request.');
      reply(res, 200, await push(remote, srcRef));
    } catch (error) {
      reply(res, 400, { ok: false, message: error instanceof Error ? error.message : 'Git push failed.' });
    } finally {
      busy = false;
    }
  };
  return {
    start(url: string) {
      const token = randomBytes(32).toString('base64url');
      turn = { token, url: new URL(PATH, url).href };
      env[URL_ENV] = turn.url;
      env[TOKEN_ENV] = token;
    },
    async finish() {
      turn = undefined;
      delete env[URL_ENV];
      delete env[TOKEN_ENV];
      await Promise.allSettled([...pending]);
    },
    handle(req: IncomingMessage, res: ServerResponse): boolean {
      if (req.url !== PATH) return false;
      const owner = turn;
      if (
        !owner ||
        req.method !== 'POST' ||
        req.headers.origin ||
        req.headers.host !== new URL(owner.url).host ||
        req.headers.authorization !== `Bearer ${owner.token}`
      ) {
        reply(res, 403, { ok: false, message: 'No active Play push permission.' });
      } else if (busy) {
        reply(res, 409, { ok: false, message: 'Another Play push is running.' });
      } else {
        busy = true;
        const work = receive(req, res, owner);
        pending.add(work);
        void work.finally(() => pending.delete(work));
      }
      return true;
    },
  };
}

export async function forwardPlayPush(
  env: NodeJS.ProcessEnv,
  remote: string | undefined,
  srcRef: string,
  slug: string,
): Promise<PushResult | undefined> {
  const url = env[URL_ENV];
  if (!url) return undefined;
  try {
    if (!/^http:\/\/127\.0\.0\.1:\d+\/agent\/git-push$/.test(url) || !env[TOKEN_ENV] || !remote)
      throw Error('Invalid Play push connection.');
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${env[TOKEN_ENV]}`, 'content-type': 'application/json' },
      body: JSON.stringify({ remote, srcRef, game: slug, cwd: realpathSync(process.cwd()) }),
    });
    const result = (await response.json()) as PushResult;
    if (typeof result.ok !== 'boolean') throw Error('Invalid Play push response.');
    return result;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Play push connection failed.' };
  }
}
