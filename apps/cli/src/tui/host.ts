import { taskLogTail } from '../task-log.js';
import { startUpdateNotice } from '../update-notice.js';
import { runInteractive, type InteractiveRun } from '../agy-interactive.js';
import { offerKitUpdate } from '../kit-update.js';
import { activityApi } from './activity.js';
import type { PendingExecution } from '../execution.js';
import { render } from 'ink';
import { createElement } from 'react';
import { EXIT_GREEN } from '../exit-codes.js';
import { formatError } from '../errors.js';
import { handleReplLine, replBanner } from '../repl.js';
import { getStatus } from '../turn.js';
import { wantsColor } from '../renderer.js';
import type { ApiClient } from '../api.js';
import { ReplApp } from './app.js';
import { createRoundWatch } from './round-watch.js';
import { isPublishTransition } from '../status-watch.js';
import { createTuiSession, formatSessionIdentity } from './session.js';
import { openWorkshop, settleBuilder, type Workshop } from '../workshop.js';
import { agentHint, discoverAgents } from '../agents.js';
import { createCliTelemetry } from '../telemetry.js';
import { reportInstall } from '../main.js';
import { sessionBrowserHost } from '../session-browser-host.js';
import { historyStore } from './history.js';
import { bufferTerminalInput } from './input-frame.js';
import { startPlayOutput } from '../play-output.js';
import { brainRequested, startPlayBrain, type PlayBrain } from '../play-brain.js';

export async function runInkRepl(input: {
  api: ApiClient;
  env: NodeJS.ProcessEnv;
  io: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream };
  token: string | null;
  resolveToken?: () => Promise<string>;
  slug?: string;
  initialLine?: string;
  // Set when a checkout in the working directory opened this session.
  checkout?: { slug: string; root: string };
  currentPath?: string;
  browserOnly?: boolean;
  detached?: boolean;
  shutdownSignal?: AbortSignal;
  entryMode?: 'home' | 'create' | 'game';
  suggestedSlug?: string;
  onReady?: (url: string) => void;
  login?: (write: (line: string) => void) => Promise<void>;
  onCheckpoint?: (state: { token: string | null; slug: string; checkout?: { root: string; slug: string } }) => void;
}): Promise<number> {
  const isTty = Boolean(input.io.stdout.isTTY);
  const color = wantsColor(input.env, isTty);
  let transcriptColumns = Math.max(2, Math.min(input.io.stdout.columns || 80, 110) - 7);
  const host: { instance?: ReturnType<typeof render>; stopInput?: () => void } = {};
  const unmount = () => {
    host.instance?.unmount();
    host.stopInput?.();
    host.stopInput = undefined;
  };
  const abort: Workshop['abort'] = { current: null };
  const telemetry = createCliTelemetry(input.api.origin);
  reportInstall(telemetry, input.env, isTty);
  let watched = '';
  let spoke = false;
  let conversationId: string | undefined;
  let uid = '';
  let who = '';
  let history: ReturnType<typeof historyStore> | undefined;
  let historyScope = '';
  let lastLines: string[] | undefined;
  let historyWarning = false;
  const saveHistory = (): void => {
    if (!history) return;
    try {
      history.save({ ...session.savedHistory(), conversationId });
    } catch {
      if (!historyWarning) {
        historyWarning = true;
        session.writeLine('Could not save local conversation history. This session can continue.');
      }
    }
  };
  const session = createTuiSession(replBanner(isTty, input.env), () => {
    if (abort.current) {
      abort.current.abort();
      return;
    }
    session.close();
    unmount();
    process.exit(EXIT_GREEN);
  });
  const bindHistory = (game: string): void => {
    const scope = game ? `game:${game}` : `directory:${input.checkout?.root ?? process.cwd()}`;
    if (!uid || input.env.GAMEDEV_HISTORY === 'off' || scope === historyScope) return;
    saveHistory();
    historyScope = scope;
    history = historyStore(input.env, input.api.origin, uid, scope);
    const saved = history.load();
    conversationId = saved.conversationId;
    session.restoreHistory(saved);
  };
  bindHistory(input.checkout?.slug ?? input.slug ?? '');
  session.subscribe((state) => {
    if (state.lines === lastLines) return;
    lastLines = state.lines;
    saveHistory();
  });
  const stopOutput = input.browserOnly ? startPlayOutput(session, (line) => input.io.stdout.write(line)) : undefined;
  const foregroundApi = activityApi(input.api, (activity) => {
    const previous = session.get().activity;
    session.setActivity(activity);
    return () => session.setActivity(previous);
  });
  let token = input.token;
  let slug = input.checkout?.slug ?? input.slug ?? '';
  let workshop: Workshop | undefined;
  let initialLine = input.initialLine;
  let working = true;
  const stop = () => {
    abort.current?.abort();
    session.close();
  };
  input.shutdownSignal?.addEventListener('abort', stop, { once: true });
  if (input.shutdownSignal?.aborted) stop();
  const browser = sessionBrowserHost(
    session,
    input.browserOnly,
    () => ({ mode: slug ? 'game' : (input.entryMode ?? 'home'), slug, suggestedSlug: input.suggestedSlug }),
    () => !working && !abort.current,
    input.detached ?? input.browserOnly,
    {
      checkout: () => (workshop?.slug === slug ? workshop : input.checkout?.slug === slug ? input.checkout : null),
      env: input.env,
      platform: { api: input.api, signedIn: () => Boolean(uid || token) },
    },
  );
  // GAMEDEVPL_BRAIN=app-agent: in builder self mode a genaicode app-agent takes the creator's messages.
  let brain: { workshop: Workshop; started?: PlayBrain } | undefined;
  const closeBrain = async (): Promise<void> => {
    const closing = brain?.started;
    brain = undefined;
    await closing?.close().catch(() => undefined);
  };
  let stopUpdateNotice: (() => void) | undefined;
  let watch: ReturnType<typeof createRoundWatch> | undefined;
  try {
    session.setIdentity(formatSessionIdentity('', slug));
    session.setActivity(input.resolveToken ? 'Connecting to Studio' : 'Checking your account');
    const openPreview = (url: string): void => {
      telemetry.record('play_requested');
      void browser.open(url).then((opened) => {
        if (!opened) session.writeLine(`Could not open the preview. Copy this URL: ${url}`);
      });
    };

    const readLogs = () => taskLogTail(workshop?.lastLog);
    const mount = (historyOffset = 0) => {
      if (input.browserOnly) return;
      const buffered = bufferTerminalInput(input.io.stdin);
      host.stopInput = buffered.stop;
      host.instance = render(
        createElement(ReplApp, {
          session,
          color,
          historyOffset,
          openPreview,
          readLogs,
          onTranscriptWidth: (columns) => {
            transcriptColumns = columns;
          },
          checkout: () => (workshop?.slug === slug ? workshop : input.checkout?.slug === slug ? input.checkout : null),
        }),
        {
          stdin: buffered.stdin,
          stdout: input.io.stdout,
          exitOnCtrlC: false,
          patchConsole: false,
        },
      );
    };
    mount();
    if (input.browserOnly) {
      input.onReady?.(await browser.start());
      session.writeLine(
        input.detached === false
          ? 'Play session ready. Keep the terminal open; Ctrl+C ends this session.'
          : 'Play session ready. Closing the terminal does not stop this session.',
      );
    }
    const refreshAccount = async (): Promise<void> => {
      const { user } = await input.api.request<{ user: { handle?: string; uid: string } }>(
        'GET',
        '/api/auth/me',
        undefined,
        AbortSignal.timeout(3000),
      );
      if (uid !== user.uid) {
        saveHistory();
        history = undefined;
        historyScope = '';
        conversationId = undefined;
      }
      uid = user.uid;
      who = user.handle ?? uid;
    };
    const [account, studio] = await Promise.allSettled([refreshAccount(), input.resolveToken?.()]);
    if (account.status === 'rejected') who = 'account unavailable';
    if (input.shutdownSignal?.aborted) return EXIT_GREEN;
    if (studio.status === 'rejected') throw studio.reason;
    if (studio.value) token = studio.value;

    if (input.browserOnly && !uid && input.login && !input.checkout) {
      const answer = await session.prompt(['Sign in', 'Continue offline'], 'Sign in to create or deliver games');
      if (answer === 'Sign in') {
        try {
          await input.login(session.writeLine);
          await refreshAccount();
        } catch (error) {
          session.writeLine(formatError(error));
        }
      }
    }
    if (!uid) session.writeLine('Account could not be verified. Local history is disabled for this session.');
    if (input.shutdownSignal?.aborted) return EXIT_GREEN;
    stopUpdateNotice = startUpdateNotice({ write: session.writeLine });
    const interactiveRun: InteractiveRun = async (request) => {
      if (input.browserOnly)
        throw new Error(
          'This agent requires an interactive terminal permission handoff. Choose another installed agent or use gamedevpl connect in a terminal.',
        );
      const offset = session.get().lines.length;
      unmount();
      try {
        return await runInteractive(request);
      } finally {
        mount(offset);
      }
    };
    if (input.browserOnly && !uid && input.checkout) initialLine = '/play';
    const paintIdentity = (): void => {
      bindHistory(slug);
      session.setIdentity(formatSessionIdentity(who, slug));
    };
    paintIdentity();
    const pendingExecution: PendingExecution = {};
    if (!input.checkout) {
      const hint = agentHint(discoverAgents(input.env));
      if (hint) session.writeLine(hint);
    }
    if (input.checkout && token) {
      paintIdentity();
      const write = (line: string): void => session.writeLine(line);
      const opened = await openWorkshop({ api: input.api, token, ...input.checkout, env: input.env, write });
      if (input.shutdownSignal?.aborted) return EXIT_GREEN;
      workshop = {
        ...input.checkout,
        token,
        env: input.env,
        ...opened,
        pick: session.prompt,
        abort,
        telemetry,
        onActivity: session.setActivity,
        onLocalTask: session.setLocalTask,
        onSteering: session.setSteering,
        onLocalPreview: browser.registerPreview,
        interactiveRun,
      };
      workshop.builder = await settleBuilder({ api: input.api, ws: workshop, status: opened.status, write });
      session.writeLine('say what to change, or /help');
    }
    if (input.checkout && token) {
      const controller = new AbortController();
      abort.current = controller;
      try {
        session.setActivity('Checking Creator Kit updates');
        await offerKitUpdate({
          api: input.api,
          cwd: input.checkout.root,
          env: input.env,
          write: (line: string) => session.writeLine(line),
          pick: session.prompt,
          abort: controller.signal,
          telemetry,
          activity: session.setActivity,
        });
      } catch (error) {
        session.writeLine(`Kit update check: ${formatError(error)}. You can retry with /kit.`);
      } finally {
        abort.current = null;
      }
    }
    watch = createRoundWatch({
      getToken: () => token,
      api: input.api,
      setLive: (live) => session.setLive(live.map((line, index) => (index === 0 ? `Studio: ${line}` : line))),
      announce: (text) => session.writeLine(text),
      onStatus: (status) => {
        if (isPublishTransition(watched, status.status)) telemetry.record('published');
        watched = status.status;
        if (token && !workshop) browser.registerPlatform(input.api, token);
      },
      onSlug: (next) => {
        if (next !== slug) session.clearPreview();
        slug = next;
        paintIdentity();
      },
    });
    for (;;) {
      if (input.shutdownSignal?.aborted) break;
      working = Boolean(initialLine);
      const line = initialLine ?? (await session.prompt());
      const allowShell = !input.browserOnly && initialLine === undefined;
      working = true;
      if (initialLine && !line.startsWith('/')) session.writeLine('› ' + line);
      initialLine = undefined;
      if (!spoke && (!input.checkout || token) && line.trim() && !/^[!/]/.test(line.trimStart())) {
        spoke = true;
        telemetry.record('first_turn');
      }
      if (line === '/login' && input.login) {
        try {
          await input.login(session.writeLine);
          await refreshAccount();
          paintIdentity();
          if (input.browserOnly && input.checkout && !workshop) initialLine = '/checkout ' + input.checkout.slug;
        } catch (error) {
          session.writeLine(formatError(error));
        }
        continue;
      }
      if (
        brainRequested(input.env) &&
        workshop?.builder === 'self' &&
        line.trim() &&
        !/^[!/]/.test(line.trimStart()) &&
        !session.get().question
      ) {
        if (brain && brain.workshop !== workshop) await closeBrain();
        try {
          // A published game takes changes through a new improvement round, which the workshop opens below.
          const published = !!token && (await getStatus(input.api, token)).status === 'published';
          if (!published && !brain) {
            session.setActivity('Starting the Play agent');
            brain = {
              workshop,
              started: await startPlayBrain({
                api: input.api,
                ws: workshop,
                prompt: session.prompt,
                write: (text) => session.writeLine(text),
                activity: (text) => session.setActivity(text),
              }),
            };
            session.setActivity('');
            if (!brain.started) session.writeLine('No installed agent can run Play tools; using the workshop.');
          }
          if (!published && brain?.started) {
            await brain.started.turn(line);
            saveHistory();
            continue;
          }
        } catch (error) {
          session.setActivity('');
          session.writeLine(formatError(error));
          continue;
        }
      }
      const turnScope = historyScope;
      let result;
      try {
        result = await handleReplLine({
          line,
          columns: () => transcriptColumns,
          allowShell,
          api: foregroundApi,
          token,
          conversationId,
          workshop,
          env: input.env,
          currentPath: input.currentPath,
          cwd: input.checkout?.root,
          pick: session.prompt,
          abort,
          telemetry,
          pendingExecution,
          interactiveRun,
          openPreview: browser.open,
          onLocalPreview: browser.registerPreview,
          onWorkshop: (opened) => {
            bindHistory(opened.slug);
            if (workshop?.slug !== opened.slug || workshop?.root !== opened.root) session.clearPreview();
            workshop = opened;
            opened.onActivity = session.setActivity;
            opened.onLocalTask = session.setLocalTask;
            opened.onSteering = session.setSteering;
            opened.onLocalPreview = browser.registerPreview;
            opened.interactiveRun = interactiveRun;
            opened.activityApi = input.api;
            input.onCheckpoint?.({
              token: opened.token,
              slug: opened.slug,
              checkout: { root: opened.root, slug: opened.slug },
            });
            if (token !== opened.token) {
              token = opened.token;
              delete pendingExecution.current;
              session.setLive([]);
              watch?.poke();
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
        watch?.poke();
      }
      if (result.workshop) {
        if (workshop?.slug !== result.workshop.slug || workshop?.root !== result.workshop.root) {
          session.clearPreview();
        }
        workshop = result.workshop;
        workshop.onActivity = session.setActivity;
        workshop.onLocalTask = session.setLocalTask;
        workshop.onSteering = session.setSteering;
        workshop.onLocalPreview = browser.registerPreview;
        workshop.interactiveRun = interactiveRun;
        workshop.activityApi = input.api;
      }
      if (result.slug) {
        if (result.slug !== slug) session.clearPreview();
        slug = result.slug;
        paintIdentity();
      }
      if (input.browserOnly && result.workshop && /^\/(checkout|connect)(?:\s|$)/.test(line)) initialLine = '/play';
      if (result.conversationId !== undefined && (result.conversationId !== '' || historyScope === turnScope)) {
        conversationId = result.conversationId;
      }
      input.onCheckpoint?.({ token, slug, checkout: workshop && { root: workshop.root, slug: workshop.slug } });
      saveHistory();
      if (result.next === 'quit') break;
    }
  } catch (error) {
    if (!input.shutdownSignal?.aborted) throw error;
  } finally {
    input.shutdownSignal?.removeEventListener('abort', stop);
    saveHistory();
    stopUpdateNotice?.();
    watch?.stop();
    stopOutput?.();
    await closeBrain();
    session.close();
    await browser.close();
    unmount();
    await telemetry.flush();
  }
  return EXIT_GREEN;
}
