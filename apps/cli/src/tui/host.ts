import { render } from 'ink';
import { createElement } from 'react';
import { EXIT_GREEN } from '../exit-codes.js';
import { handleReplLine, replBanner } from '../repl.js';
import { wantsColor } from '../renderer.js';
import type { ApiClient } from '../api.js';
import type { IntakeDraft } from '../create.js';
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
  let who = '';
  let slug = '';
  const paintIdentity = (): void => session.setIdentity(formatSessionIdentity(who, slug));
  void input.api
    .request<{ handle?: string; uid?: string }>('GET', '/api/me/profile')
    .then((profile) => {
      who = profile.handle ?? profile.uid ?? '';
      paintIdentity();
    })
    .catch(() => undefined);
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
  let draft: IntakeDraft | null = null;
  try {
    for (;;) {
      const asking = draft?.questions[draft.index];
      const line = await session.prompt(asking?.choices, asking?.prompt);
      const result = await handleReplLine({
        line,
        api: input.api,
        token,
        draft,
        write: (text) => session.writeLine(text),
      });
      if (result.token !== undefined) {
        token = result.token;
        watch.poke();
      }
      if (result.slug) {
        slug = result.slug;
        paintIdentity();
      }
      if (result.draft !== undefined) draft = result.draft;
      if (result.next === 'quit') break;
    }
  } finally {
    watch.stop();
    session.close();
    host.instance?.unmount();
  }
  return EXIT_GREEN;
}
