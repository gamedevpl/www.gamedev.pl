import { matchingCheckout, resolveLocalGame } from './local-recovery.js';
import type { InteractiveRun } from './agy-interactive.js';
import { dirname, join, resolve } from 'node:path';
import type { ApiClient } from './api.js';
import { discoverAgents } from './agents.js';
import { checkoutGame, findCheckout, localGameFiles } from './checkout.js';
import { connectGame } from './connect.js';
import { studioToken } from './studio.js';
import { openWorkshop, type Workshop, type PickChoice } from './workshop.js';
import type { CliTelemetry } from './telemetry.js';

export type GameSession = { token: string; slug: string; workshop?: Workshop; conversationId: string };
type Input = {
  api: ApiClient;
  slug: string;
  dest?: string;
  cwd?: string;
  sessionToken?: string;
  env: NodeJS.ProcessEnv;
  pick?: PickChoice;
  abort: Workshop['abort'];
  workshop?: Workshop;
  write: (line: string) => void;
  onActivity?: (text: string) => void;
  telemetry?: CliTelemetry;
  interactiveRun?: InteractiveRun;
};

export async function checkoutSession(input: Input): Promise<GameSession | null> {
  const current = input.workshop ?? findCheckout(input.cwd ?? process.cwd());
  const root = resolve(
    input.dest ??
      (current ? (current.slug === input.slug ? current.root : join(dirname(current.root), input.slug)) : input.slug),
  );
  const existing = findCheckout(root);
  const session = input.sessionToken
    ? { token: input.sessionToken }
    : existing?.root === root && existing.slug === input.slug
      ? await resolveLocalGame({ ...input, root })
      : { token: await studioToken(input.api, input.slug) };
  if (!session) return null;
  const { token } = session;
  if (existing?.root !== root || existing.slug !== input.slug) {
    input.onActivity?.(`Downloading ${input.slug}`);
    await checkoutGame({ api: input.api, slug: input.slug, dest: root, allowUndelivered: true });
  }
  input.telemetry?.record('checkout_opened');
  const opened = await openWorkshop({ ...input, token, root });
  const workshop: Workshop = {
    ...opened,
    token,
    slug: input.slug,
    root,
    env: input.env,
    pick: input.pick ?? (async () => ''),
    abort: input.abort,
    telemetry: input.telemetry,
    onActivity: input.onActivity,
  };
  if (localGameFiles(root, input.slug).every((file) => file.path.endsWith('.md'))) {
    input.write('This game has a brief but no playable build yet. Tell the agent what to build first.');
  }
  input.write(`Working in ${root}. Say what to change; /play previews, /push delivers.`);
  return { token, slug: input.slug, workshop, conversationId: '' };
}

export async function connectSession(
  input: Input & { agent?: string; handoff?: boolean; manual?: boolean },
): Promise<GameSession | null> {
  let agent = input.agent;
  const base = resolve(input.dest ?? input.workshop?.root ?? input.cwd ?? process.cwd());
  const existing = matchingCheckout(base, input.slug);
  let sessionToken: string | undefined;
  const openLocal = async (selected?: string) => {
    const opened = await checkoutSession({ ...input, sessionToken, dest: existing?.root ?? input.dest });
    if (opened?.workshop && selected) {
      opened.workshop.selectedAgent = selected;
      input.write(`${selected} will edit your existing local files. Say what to change; /play previews locally.`);
    }
    return opened;
  };
  if (existing && !input.manual) {
    input.write(`Found local checkout: ${existing.root} — local files are preserved.`);
    const resolved = await resolveLocalGame({ ...input, root: existing.root });
    if (!resolved) return null;
    sessionToken = resolved.token;
    if (resolved.recovered || agent) return openLocal(agent);
  }
  input.telemetry?.record('connect_opened');
  if (!agent && !input.manual && input.pick) {
    const agents = discoverAgents(input.env).filter((row) => row.installed && (existing || row.mcp));
    for (const row of agents) input.telemetry?.record('delegate_offered', { adapter: row.name });
    const checkout = existing
      ? 'Continue in existing checkout — keep local changes'
      : 'Open a local checkout — edit and play here';
    const chat = 'Continue chatting about this game';
    const manual = 'Show manual MCP setup';
    const labels = agents.map((row) => `${row.name} — ${existing ? 'edit local files' : 'MCP; platform sources'}`);
    const choice = await input.pick([checkout, chat, ...labels, manual], `${input.slug} — how would you like to work?`);
    if (choice === checkout) return openLocal();
    if (choice === chat) {
      input.write(`Talking about ${input.slug}. Say what you want to change, or /checkout to work locally.`);
      return { token: await studioToken(input.api, input.slug), slug: input.slug, conversationId: '' };
    }
    if (choice !== manual) {
      agent = agents[labels.indexOf(choice)]?.name;
      if (!agent) return null;
      if (existing) return openLocal(agent);
    }
  }
  const controller = new AbortController();
  input.abort.current = controller;
  try {
    if (agent) input.onActivity?.(`${agent} is working on ${input.slug} through MCP`);
    await connectGame({
      ...input,
      agent,
      dest: input.dest ?? input.workshop?.root ?? input.cwd ?? process.cwd(),
      abort: controller.signal,
    });
    input.write(
      `You are in the interactive session for ${input.slug}. /checkout downloads files; /help shows actions.`,
    );
    return { token: await studioToken(input.api, input.slug), slug: input.slug, conversationId: '' };
  } finally {
    input.abort.current = null;
  }
}
