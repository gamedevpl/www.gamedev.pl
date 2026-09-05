import { render } from 'ink';
import { createElement } from 'react';
import { EXIT_GREEN } from '../exit-codes.js';
import { formatError } from '../errors.js';
import { handleReplLine, replBanner } from '../repl.js';
import { wantsColor } from '../renderer.js';
import type { ApiClient } from '../api.js';
import { ReplApp } from './app.js';
import { createRoundWatch } from './round-watch.js';
import { createTuiSession, formatSessionIdentity } from './session.js';

export async function runInkRepl(input: {
  api: ApiClient;
  env: NodeJS.ProcessEnv;
  io: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream };
  token: string | null;
}): Promise<number> {
  const isTty = Boolean(input.io.stdout.isTTY);
  const color = wantsColor(input.env, isTty);
  const host: { instance?: ReturnType<typeof render> } = {};
  const session = createTuiSession(replBanner(isTty, input.env), () => {
    session.close();
    host.instance?.unmount();
    process.exit(EXIT_GREEN);
  });
  host.instance = render(createElement(ReplApp, { session, color }), {
    stdin: input.io.stdin,
    stdout: input.io.stdout,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  let token = input.token;
  let conversationId: string | undefined;
  let who = '';
  let slug = '';
  const paintIdentity = (): void => session.setIdentity(formatSessionIdentity(who, slug));
  const watch = createRoundWatch({
    getToken: () => token,
    api: input.api,
    setLive: (live) => session.setLive(live),
    announce: (text) => session.writeLine(text),
    onSlug: (next) => {
      slug = next;
      paintIdentity();
    },
  });
  // Don't block the prompt on profile.
  void input.api.request<{ handle?: string; uid?: string }>('GET', '/api/me/profile').then(
    (profile) => {
      who = profile.handle ?? profile.uid ?? '';
      paintIdentity();
    },
    (error: unknown) => {
      who = 'not signed in';
      paintIdentity();
      session.writeLine(formatError(error));
    },
  );
  try {
    for (;;) {
      const line = await session.prompt();
      let result;
      try {
        result = await handleReplLine({
          line,
          api: input.api,
          token,
          conversationId,
          write: (text) => session.writeLine(text),
        });
      } catch (error) {
        session.writeLine(formatError(error));
        continue;
      }
      if (result.token !== undefined) {
        token = result.token;
        watch.poke();
      }
      if (result.slug) {
        slug = result.slug;
        paintIdentity();
      }
      if (result.conversationId !== undefined) conversationId = result.conversationId;
      if (result.next === 'quit') break;
    }
  } finally {
    watch.stop();
    session.close();
    host.instance?.unmount();
  }
  return EXIT_GREEN;
}
