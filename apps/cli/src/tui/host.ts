import { activityApi } from './activity.js';
import type { PendingExecution } from '../execution.js';
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
import { openWorkshop, settleBuilder, type Workshop } from '../workshop.js';
import { agentHint, discoverAgents } from '../agents.js';
import { createCliTelemetry } from '../telemetry.js';

export async function runInkRepl(input: {
  api: ApiClient;
  env: NodeJS.ProcessEnv;
  io: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream };
  token: string | null;
  // Set when a checkout in the working directory opened this session.
  checkout?: { slug: string; root: string };
}): Promise<number> {
  const isTty = Boolean(input.io.stdout.isTTY);
  const color = wantsColor(input.env, isTty);
  const host: { instance?: ReturnType<typeof render> } = {};
  const abort: Workshop['abort'] = { current: null };
  const telemetry = createCliTelemetry(input.api.origin);
  const session = createTuiSession(replBanner(isTty, input.env), () => {
    if (abort.current) {
      abort.current.abort();
      return;
    }
    session.close();
    host.instance?.unmount();
    process.exit(EXIT_GREEN);
  });
  const foregroundApi = activityApi(input.api, (activity) => {
    const previous = session.get().activity;
    session.setActivity(activity);
    return () => session.setActivity(previous);
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
  let slug = input.checkout?.slug ?? '';
  const paintIdentity = (): void => session.setIdentity(formatSessionIdentity(who, slug));
  let workshop: Workshop | undefined;
  const pendingExecution: PendingExecution = {};
  if (!input.checkout) {
    const hint = agentHint(discoverAgents(input.env));
    if (hint) session.writeLine(hint);
  }
  if (input.checkout && token) {
    paintIdentity();
    const write = (line: string): void => session.writeLine(line);
    const opened = await openWorkshop({ api: input.api, token, ...input.checkout, env: input.env, write });
    workshop = {
      ...input.checkout,
      token,
      env: input.env,
      ...opened,
      pick: session.prompt,
      abort,
      telemetry,
      onActivity: session.setActivity,
    };
    workshop.builder = await settleBuilder({ api: input.api, ws: workshop, status: opened.status, write });
    session.writeLine('say what to change, or /help');
  }
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
          api: foregroundApi,
          token,
          conversationId,
          workshop,
          env: input.env,
          pick: session.prompt,
          abort,
          telemetry,
          pendingExecution,
          onWorkshop: (opened) => {
            workshop = opened;
            opened.onActivity = session.setActivity;
            if (token !== opened.token) {
              token = opened.token;
              delete pendingExecution.current;
              session.setLive([]);
              watch.poke();
            }
          },
          onActivity: (activity) => session.setActivity(activity),
          write: (text) => session.writeLine(text),
        });
      } catch (error) {
        session.writeLine(formatError(error));
        continue;
      }
      if (result.token !== undefined) {
        if (result.token !== token) {
          if (workshop?.token !== result.token) workshop = undefined;
          delete pendingExecution.current;
        }
        token = result.token;
        watch.poke();
      }
      if (result.workshop) workshop = result.workshop;
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
    await telemetry.flush();
  }
  return EXIT_GREEN;
}
