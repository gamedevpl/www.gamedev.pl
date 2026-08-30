import { render } from 'ink';
import { createElement } from 'react';
import { EXIT_GREEN } from '../exit-codes.js';
import { handleReplLine, replBanner } from '../repl.js';
import { wantsColor } from '../renderer.js';
import type { ApiClient } from '../api.js';
import type { IntakeDraft } from '../create.js';
import { ReplApp } from './app.js';
import { createTuiSession } from './session.js';

export async function runInkRepl(input: {
  api: ApiClient;
  env: NodeJS.ProcessEnv;
  io: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream };
  token: string | null;
}): Promise<number> {
  const color = wantsColor(input.env, true);
  const session = createTuiSession(replBanner(true, input.env));
  const instance = render(createElement(ReplApp, { session, color }), {
    stdin: input.io.stdin,
    stdout: input.io.stdout,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  let token = input.token;
  let draft: IntakeDraft | null = null;
  try {
    for (;;) {
      const asking = draft?.questions[draft.index];
      const line = await session.prompt(asking?.choices);
      const result = await handleReplLine({
        line,
        api: input.api,
        token,
        draft,
        write: (text) => session.writeLine(text),
      });
      if (result.token !== undefined) token = result.token;
      if (result.draft !== undefined) draft = result.draft;
      if (result.next === 'quit') break;
    }
  } finally {
    session.close();
    instance.unmount();
  }
  return EXIT_GREEN;
}
