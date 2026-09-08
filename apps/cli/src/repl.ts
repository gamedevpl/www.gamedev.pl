import { offerKitUpdate, updateKit } from './kit-update.js';
import { improvePublished } from './improve.js';
import { playGame } from './play.js';
import { CLI_BIN, cliUsage } from './bin-name.js';
import { glyphs, wantsColor } from './renderer.js';
import { completeSlash, parseArgv, SLASH_VERBS, type SlashVerb } from './argv.js';
import { getStatus, postTurn, prepareTurn } from './turn.js';
import { formatStatusLines } from './status-watch.js';
import type { ApiClient } from './api.js';
import { diffGame, formatSyncLines, pullGame, readCheckoutSlug } from './checkout.js';
import { connectSession, checkoutSession } from './connect-flow.js';
import { formatSubmitLines, submitGame } from './submit.js';
import { dispatchReadVerb } from './verbs.js';
import { postCliChat } from './chat.js';
import { CLI_VERSION } from './update.js';
import { formatError } from './errors.js';
import { formatHelp } from './help.js';
import { MASCOT_ASCII } from './tui/mascot.js';
import { discoverAgents } from './agents.js';
import type { PickChoice } from './workshop.js';
import { handoffBuilder, handoffLine, refreshBuilder, workshopTurn, type Workshop } from './workshop.js';
import { chooseExecution, executeChoice, type PendingExecution } from './execution.js';
import type { CliTelemetry } from './telemetry.js';

export type ReplLineResult = {
  next: 'continue' | 'quit';
  token?: string | null;
  slug?: string;
  conversationId?: string;
  workshop?: Workshop;
};

export async function handleReplLine(input: {
  line: string;
  api: ApiClient;
  token: string | null;
  conversationId?: string;
  // Set when the session opened from a game checkout.
  workshop?: Workshop;
  env?: NodeJS.ProcessEnv;
  pick?: PickChoice;
  abort?: Workshop['abort'];
  telemetry?: CliTelemetry;
  pendingExecution?: PendingExecution;
  onWorkshop?: (ws: Workshop) => void;
  write: (s: string) => void;
  onActivity?: (activity: string) => void;
}): Promise<ReplLineResult> {
  const retry = input.line.trim() === '/retry' ? input.pendingExecution?.current : undefined;
  if (input.line.trim() === '/retry' && !retry) {
    input.write('no pending task to retry');
    return { next: 'continue', conversationId: input.conversationId };
  }
  let trimmed = retry?.request ?? input.line.trim();
  if (!trimmed) return { next: 'continue', conversationId: input.conversationId };
  if (trimmed === '/quit' || trimmed === '/exit') return { next: 'quit' };
  if (trimmed === '/kit' || trimmed === '/kit update') {
    const controller = new AbortController();
    if (input.abort) input.abort.current = controller;
    try {
      await (trimmed === '/kit update' ? updateKit : offerKitUpdate)({
        api: input.api,
        cwd: input.workshop?.root ?? process.cwd(),
        env: input.env ?? process.env,
        pick: input.pick,
        write: input.write,
        abort: controller.signal,
        telemetry: input.telemetry,
        activity: input.onActivity,
      });
    } catch (error) {
      input.write(formatError(error));
    } finally {
      if (input.abort) input.abort.current = null;
    }
    return { next: 'continue', conversationId: input.conversationId };
  }
  if (/^\/play(?:\s|$)/u.test(trimmed)) {
    try {
      const parsed = parseArgv([
        'node',
        'cli',
        ...(trimmed.startsWith('/') ? trimmed.slice(1).split(/\s+/u) : ['play']),
      ]);
      const slug =
        parsed.args[0] ??
        input.workshop?.slug ??
        (input.token ? (await getStatus(input.api, input.token)).slug : undefined);
      input.onActivity?.('Starting game preview');
      await playGame({
        cwd: input.workshop?.root ?? process.cwd(),
        slug,
        origin: input.api.origin,
        env: input.env,
        noOpen: parsed.flags['no-open'] === true,
        stop: parsed.flags.stop === true,
        write: input.write,
        telemetry: input.telemetry,
      });
    } catch (error) {
      input.write(formatError(error));
    }
    return { next: 'continue', conversationId: input.conversationId };
  }
  if (trimmed.startsWith('/')) {
    const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
    if (cmd === 'help') {
      input.write(formatHelp(true));
      return { next: 'continue', conversationId: input.conversationId };
    }
    const ws = input.workshop;
    if (
      ws &&
      (cmd === 'delegate' || (cmd === 'builder' && (!rest[0] || rest[0] === 'self' || rest[0] === 'platform')))
    ) {
      if (cmd === 'builder' && rest[0] === 'platform' && input.pendingExecution) delete input.pendingExecution.current;
      await handleWorkshopVerb({ cmd, rest, api: input.api, ws, write: input.write });
      return { next: 'continue', conversationId: input.conversationId };
    }
    if (cmd === 'status') {
      const tok = rest[0] || input.token;
      if (!tok) {
        input.write(`run it as ${cliUsage('status')}`);
        return { next: 'continue', conversationId: input.conversationId };
      }
      try {
        const status = await getStatus(input.api, tok);
        input.write(formatStatusLines(status, input.api.origin).join('\n'));
      } catch (error) {
        input.write(formatError(error));
      }
      return { next: 'continue', conversationId: input.conversationId };
    }
    if (cmd === 'submit') {
      try {
        const parsed = parseArgv(['node', 'cli', 'submit', ...rest]);
        const dest = parsed.args[0] ?? input.workshop?.root ?? process.cwd();
        const slug = (typeof parsed.flags.slug === 'string' ? parsed.flags.slug : null) ?? readCheckoutSlug(dest);
        if (!slug) {
          input.write(`run it as ${cliUsage('submit', '[dir]')}`);
          return { next: 'continue', conversationId: input.conversationId };
        }
        const result = await submitGame({
          api: input.api,
          slug,
          dest,
          force: parsed.flags.force === true,
          publish: parsed.flags.publish === true,
        });
        input.write(formatSubmitLines(result, slug).join('\n'));
      } catch (error) {
        input.write(formatError(error));
      }
      return { next: 'continue', conversationId: input.conversationId };
    }
    if (cmd === 'connect' || cmd === 'checkout' || cmd === 'pull' || cmd === 'diff') {
      try {
        const parsed = parseArgv(['node', 'cli', cmd, ...rest]);
        const cwd = input.workshop?.root ?? process.cwd();
        const sessionSlug =
          (cmd === 'connect' || cmd === 'checkout') && !parsed.args[0] && !input.workshop && input.token
            ? (await getStatus(input.api, input.token)).slug
            : undefined;
        const slug = parsed.args[0] ?? input.workshop?.slug ?? sessionSlug ?? readCheckoutSlug(cwd);
        if (!slug) {
          input.write(`Choose a game: /${cmd} <slug>. /games lists your games.`);
          return { next: 'continue', conversationId: input.conversationId };
        }
        if (cmd === 'connect' || cmd === 'checkout') {
          const options = {
            ...input,
            slug,
            dest: parsed.args[1],
            env: input.env ?? process.env,
            abort: input.abort ?? { current: null },
          };
          const opened =
            cmd === 'checkout'
              ? await checkoutSession(options)
              : await connectSession({
                  ...options,
                  agent: typeof parsed.flags.agent === 'string' ? parsed.flags.agent : undefined,
                  handoff: parsed.flags.handoff === true,
                  manual: parsed.flags.manual === true,
                });
          return { next: 'continue', ...(opened ?? {}) };
        }
        const dest = parsed.args[1] ?? cwd;
        if (cmd === 'pull') {
          const pulled = await pullGame({ api: input.api, slug, dest, force: parsed.flags.force === true });
          input.write(`pulled ${slug} @ ${pulled.version}`);
        } else {
          input.write(formatSyncLines(await diffGame({ api: input.api, slug, dest })).join('\n'));
        }
      } catch (error) {
        input.write(formatError(error));
      }
      return { next: 'continue', conversationId: input.conversationId };
    }
    if (cmd && (SLASH_VERBS as readonly string[]).includes(cmd)) {
      try {
        const parsed = parseArgv(['node', 'cli', cmd, ...rest]);
        const chunks: string[] = [];
        const stdout = { write: (s: string) => (chunks.push(s), true) } as unknown as NodeJS.WriteStream;
        const code = await dispatchReadVerb({
          verb: cmd as SlashVerb,
          args: parsed.args,
          flags: parsed.flags,
          api: input.api,
          io: { stdout },
          env: input.env,
        });
        if (code !== null) {
          input.write(chunks.join('').trimEnd() || `/${cmd}`);
          return { next: 'continue', conversationId: input.conversationId };
        }
        input.write(`run it as ${cliUsage(cmd)}`);
        return { next: 'continue', conversationId: input.conversationId };
      } catch (error) {
        input.write(formatError(error));
        return { next: 'continue', conversationId: input.conversationId };
      }
    }
    const matches = completeSlash(trimmed);
    if (matches.length) input.write(matches.map((verb) => `/${verb}`).join('  '));
    return { next: 'continue', conversationId: input.conversationId };
  }
  if (!retry) {
    try {
      const result = await postCliChat(input.api, trimmed, input.conversationId, Boolean(input.pick), {
        ...(input.token ? { token: input.token } : {}),
        ...(input.workshop ? { checkoutSlug: input.workshop.slug } : {}),
        agents:
          input.workshop?.adapters.map((agent) => agent.name) ??
          discoverAgents(input.env)
            .filter((agent) => agent.installed)
            .map((agent) => agent.name),
      });
      input.conversationId = result.conversationId;
      if (result.kind === 'action') {
        if (result.action.name === 'play') {
          input.onActivity?.('Starting game preview');
          await playGame({
            cwd: input.workshop?.root ?? process.cwd(),
            slug: result.action.slug,
            origin: input.api.origin,
            env: input.env,
            write: input.write,
            telemetry: input.telemetry,
          });
          return { next: 'continue', conversationId: result.conversationId };
        }
        if (!input.token) throw new Error('CLI assistant action requires an active game');
        if (result.action.name === 'status') {
          input.write(formatStatusLines(await getStatus(input.api, input.token), input.api.origin).join('\n'));
          return { next: 'continue', conversationId: result.conversationId };
        }
        trimmed = result.action.request;
      }
      if (result.kind === 'proposal') {
        if (!input.pick) return { next: 'continue', conversationId: result.conversationId };
        const env = input.env ?? process.env;
        const choice = await chooseExecution({ env, pick: input.pick, telemetry: input.telemetry });
        if (!choice) return { next: 'continue', conversationId: result.conversationId };
        input.telemetry?.record('build_requested');
        const created = await input.api.request<{ token: string; slug: string }>('POST', '/api/submissions', {
          title: result.title,
          concept: result.concept,
          builder: choice.builder,
        });
        input.write(`▸ opened ${created.slug}`);
        const opened: ReplLineResult = {
          next: 'continue',
          token: created.token,
          slug: created.slug,
          conversationId: result.conversationId,
        };
        try {
          input.onActivity?.('Running the selected builder');
          opened.workshop = await executeChoice({
            api: input.api,
            choice,
            ...created,
            request: result.concept,
            env,
            pick: input.pick,
            write: input.write,
            abort: input.abort ?? { current: null },
            telemetry: input.telemetry,
            onWorkshop: input.onWorkshop,
          });
        } catch (error) {
          input.write(formatError(error));
        }
        return opened;
      }
      if (result.kind === 'create') {
        input.write(`▸ opened ${result.slug}${result.ack ? ` — ${result.ack}` : ''}`);
        return {
          next: 'continue',
          token: result.token,
          slug: result.slug,
          conversationId: result.conversationId,
        };
      }
      if (result.kind === 'reply') {
        input.write(`◆ ${result.text}`);
        return { next: 'continue', conversationId: result.conversationId };
      }
    } catch (error) {
      input.write(formatError(error));
      return { next: 'continue', conversationId: input.conversationId };
    }
  }
  if (!input.token) return { next: 'continue', conversationId: input.conversationId };
  try {
    if (input.pick) {
      const status = await getStatus(input.api, input.token);
      if (status.status === 'published') {
        const slug = input.workshop?.slug ?? status.slug;
        if (!slug) throw new Error('published game slug is unavailable');
        const improved = await improvePublished({
          api: input.api,
          token: input.token,
          slug,
          request: trimmed,
          env: input.env ?? process.env,
          pick: input.pick,
          workshop: input.workshop,
          write: input.write,
          abort: input.abort ?? { current: null },
          telemetry: input.telemetry,
          onWorkshop: input.onWorkshop,
        });
        return { ...improved, conversationId: input.conversationId };
      }
      const prepared = retry ? { kind: 'proposal' as const } : await prepareTurn(input.api, input.token, trimmed);
      if (prepared.kind === 'reply') {
        input.write(`◆ ${prepared.text}`);
        return { next: 'continue', conversationId: input.conversationId };
      }
      if (prepared.kind === 'proposal') {
        const env = input.env ?? process.env;
        const choice =
          retry?.choice ??
          (await chooseExecution({
            env,
            pick: input.pick,
            workshop: input.workshop,
            telemetry: input.telemetry,
          }));
        if (!choice) return { next: 'continue', conversationId: input.conversationId };
        const slug = input.workshop?.slug ?? status.slug;
        if (!slug) {
          input.write('game slug is unavailable — /status to check the round');
          return { next: 'continue', conversationId: input.conversationId };
        }
        if (choice.builder !== (status.builder ?? 'platform')) {
          const outcome = await handoffBuilder(input.api, input.token, choice.builder, status.builder ?? 'platform');
          if (input.workshop) {
            input.workshop.builder = outcome.builder;
            if (choice.builder === 'self') input.workshop.selectedAgent = choice.spec.name;
            else delete input.workshop.selectedAgent;
          }
          if (outcome.pending) {
            if (input.pendingExecution) input.pendingExecution.current = { choice, request: trimmed };
            input.write(`${handoffLine(outcome, slug)} — /retry resumes this task with the selected agent`);
            return { next: 'continue', conversationId: input.conversationId };
          }
        } else if (input.workshop) input.workshop.builder = choice.builder;
        if (input.pendingExecution) delete input.pendingExecution.current;
        input.telemetry?.record('build_requested');
        const result = await postTurn(input.api, input.token, trimmed);
        if (result.kind === 'reply') {
          input.write(`◆ ${result.text}`);
          return { next: 'continue', conversationId: input.conversationId };
        }
        input.write(`▸ build ${result.roundId}${result.ack ? ` — ${result.ack}` : ''}`);
        input.onActivity?.('Running the selected builder');
        const workshop = await executeChoice({
          api: input.api,
          choice,
          slug,
          token: input.token,
          request: trimmed,
          env,
          pick: input.pick,
          write: input.write,
          workshop: input.workshop,
          abort: input.abort ?? { current: null },
          telemetry: input.telemetry,
          onWorkshop: input.onWorkshop,
        });
        return { next: 'continue', workshop, conversationId: input.conversationId };
      }
      input.write(
        'CLI server does not support builder selection before dispatch — update the server before delegating',
      );
      return { next: 'continue', conversationId: input.conversationId };
    }
    const result = await postTurn(input.api, input.token, trimmed);
    if (result.kind === 'reply') {
      input.write(`◆ ${result.text}`);
      return { next: 'continue', conversationId: input.conversationId };
    }
    input.write(`▸ build ${result.roundId}${result.ack ? ` — ${result.ack}` : ''}`);
    const ws = input.workshop;
    if (!ws) return { next: 'continue', conversationId: input.conversationId };
    if (ws.builder !== 'self') {
      input.write(`the platform builds this round — /pull when it lands, or /builder self to build here`);
      return { next: 'continue', conversationId: input.conversationId };
    }
    input.onActivity?.('Running the local builder');
    await workshopTurn({ api: input.api, ws, request: trimmed, ack: result.ack, write: input.write });
    return { next: 'continue', conversationId: input.conversationId };
  } catch (error) {
    input.write(formatError(error));
    return { next: 'continue', conversationId: input.conversationId };
  }
}

async function handleWorkshopVerb(input: {
  cmd: string;
  rest: string[];
  api: ApiClient;
  ws: Workshop;
  write: (s: string) => void;
}): Promise<void> {
  const { ws } = input;
  try {
    if (input.cmd === 'builder') {
      const wanted = input.rest[0];
      if (wanted !== 'self' && wanted !== 'platform') {
        await refreshBuilder(input.api, ws);
        input.write(`builder ${ws.builder} — /builder self or /builder platform to switch`);
        return;
      }
      if (wanted === ws.builder) {
        input.write(`builder is already ${wanted}`);
        return;
      }
      const outcome = await handoffBuilder(input.api, ws.token, wanted, ws.builder);
      if (wanted === 'platform') delete ws.selectedAgent;
      ws.builder = outcome.builder;
      input.write(handoffLine(outcome, ws.slug));
      return;
    }
    const parsed = parseArgv(['node', 'cli', 'delegate', ...input.rest]);
    const request = parsed.args.join(' ');
    if (!request) {
      input.write(`say what to do: /delegate make the jump feel floatier`);
      return;
    }
    await workshopTurn({
      api: input.api,
      ws,
      request,
      agent: typeof parsed.flags.agent === 'string' ? parsed.flags.agent : undefined,
      write: input.write,
    });
  } catch (error) {
    input.write(formatError(error));
  }
}

export function replBanner(isTty: boolean, env: NodeJS.ProcessEnv): string {
  const g = glyphs(wantsColor(env, isTty));
  const hint = `${g.agent} ${CLI_BIN} ${CLI_VERSION} — ${g.prompt} to talk, /help for verbs`;
  return isTty ? `${MASCOT_ASCII}\n${hint}` : hint;
}
