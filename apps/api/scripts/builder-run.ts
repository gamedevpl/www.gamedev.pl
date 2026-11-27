// New-game builder rounds on the production MCP, prompts from this checkout.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildBrief } from '../src/agent-surface/agent-backend.js';
import { buildPrompt } from '../src/agent-surface/build-prompt.js';
import { builderSystemPrompt } from '../src/agent-surface/builder-system-prompt.js';
import type { ManagedAgentEffort } from '../src/agent-surface/managed-agent.js';
import { createAnthropicManagedProvider } from '../src/agent-surface/managed-provider-anthropic.js';
// @ts-expect-error -- plain .mjs shared with infra tooling
import { scoreSession } from '../../../infra/session-score-lib.mjs';

const ANTHROPIC = 'https://api.anthropic.com';
const VALUE_FLAGS = [
  'briefs',
  'effort',
  'kickoff-extra',
  'max-cents',
  'max-minutes',
  'mcp-url',
  'model',
  'only',
  'out',
  'runs',
  'system',
  'title-prefix',
];

interface Brief {
  id: string;
  title: string;
  concept: string;
  locale?: string;
}

function usage(message: string): never {
  console.error(`${message}\nflags: ${VALUE_FLAGS.map((name) => `--${name}`).join(' ')} --prompt`);
  process.exit(2);
}

// Strict: a typo must not silently fall back to paid defaults.
function parseArgs(argv: string[]): { values: Map<string, string>; printPrompt: boolean } {
  const values = new Map<string, string>();
  let printPrompt = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prompt') {
      printPrompt = true;
      continue;
    }
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match || !VALUE_FLAGS.includes(match[1])) usage(`unknown argument: ${arg}`);
    const value = match[2] ?? argv[++i];
    if (value === undefined || value.startsWith('--')) usage(`--${match[1]} needs a value`);
    values.set(match[1], value);
  }
  return { values, printPrompt };
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) usage(`--${name} must be a positive integer`);
  return value;
}

const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sessionEvents(apiKey: string, sessionId: string): Promise<{ events: unknown[]; error?: string }> {
  const events: unknown[] = [];
  let page: string | undefined;
  try {
    do {
      const query = new URLSearchParams({ limit: '1000', ...(page ? { page } : {}) });
      const response = await fetch(`${ANTHROPIC}/v1/sessions/${sessionId}/events?${query}`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'managed-agents-2026-04-01',
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const body = (await response.json()) as { data?: unknown[]; next_page?: string | null };
      events.push(...(body.data ?? []));
      page = body.next_page ?? undefined;
    } while (page);
    return { events };
  } catch (error) {
    return { events, error: error instanceof Error ? error.message : String(error) };
  }
}

type Event = { type?: string; name?: string; content?: Array<{ text?: string }>; is_error?: boolean };

// Parsed JSON results of one MCP tool, in call order.
function toolResults(events: unknown[], tool: string): Array<Record<string, unknown>> {
  const names = new Map<string, string>();
  const results: Array<Record<string, unknown>> = [];
  for (const raw of events as Array<Event & { id?: string; mcp_tool_use_id?: string }>) {
    if (raw.type === 'agent.mcp_tool_use' && raw.id) names.set(raw.id, raw.name ?? '');
    if (raw.type !== 'agent.mcp_tool_result' || raw.is_error) continue;
    if (names.get(raw.mcp_tool_use_id ?? '') !== tool) continue;
    const text = (raw.content ?? []).map((part) => part.text ?? '').join('');
    try {
      results.push(JSON.parse(text) as Record<string, unknown>);
    } catch {
      // A non-JSON result carries nothing this report reads.
    }
  }
  return results;
}

// One stateless JSON-RPC call; the verdict lands minutes after submit.
async function mcpTool(url: string, key: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const text = await response.text();
  const json = text.startsWith('{') ? text : (text.match(/^data: (.*)$/m)?.[1] ?? '{}');
  const result = (JSON.parse(json) as { result?: { structuredContent?: unknown; content?: Array<{ text?: string }> } })
    .result;
  if (result?.structuredContent) return result.structuredContent;
  const body = result?.content?.[0]?.text;
  return body ? JSON.parse(body) : { status: response.status, raw: text.slice(0, 500) };
}

async function main(): Promise<void> {
  const { values, printPrompt } = parseArgs(process.argv.slice(2));
  const value = (name: string) => values.get(name);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const briefsPath = value('briefs') ?? path.join(repoRoot, 'apps/api/scripts/builder-briefs.json');
  const all = JSON.parse(await readFile(briefsPath, 'utf8')) as Brief[];
  const only = value('only')?.split(',').filter(Boolean);
  const unknown = only?.filter((id) => !all.some((brief) => brief.id === id));
  if (unknown?.length) usage(`unknown brief id: ${unknown.join(', ')}`);
  const briefs = only ? all.filter((brief) => only.includes(brief.id)) : all;
  const runs = positiveInt(value('runs'), 1, 'runs');
  const maxCents = positiveInt(value('max-cents'), 300, 'max-cents');
  const maxMinutes = positiveInt(value('max-minutes'), 40, 'max-minutes');
  const titlePrefix = value('title-prefix') ?? '[hc] ';
  const mcpUrl = (value('mcp-url') ?? 'https://www.gamedev.pl/api/mcp').replace(/\/$/, '');
  const systemPrompt = value('system')
    ? await readFile(value('system')!, 'utf8')
    : builderSystemPrompt({ shell: true });
  const extra = value('kickoff-extra') ? await readFile(value('kickoff-extra')!, 'utf8') : '';

  const kickoff = (brief: Brief) => {
    const build: BuildBrief = {
      jobId: 0,
      createGame: { title: `${titlePrefix}${brief.title}`, concept: brief.concept, locale: brief.locale ?? 'en' },
      spec: brief.concept,
      ...(brief.locale ? { locale: brief.locale } : {}),
    } as BuildBrief;
    return [buildPrompt(build, { shell: true }), extra].filter(Boolean).join('\n\n');
  };
  if (printPrompt) {
    console.log(`${systemPrompt}\n\n${'='.repeat(72)}\n\n${kickoff(briefs[0])}`);
    return;
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY)?.trim();
  const agentId = process.env.MANAGED_AGENT_ID?.trim();
  const environmentId = process.env.MANAGED_AGENT_ENVIRONMENT_ID?.trim();
  const creatorKey = process.env.GAMEDEV_CREATOR_KEY?.trim();
  if (!apiKey || !agentId || !environmentId || !creatorKey) {
    usage(
      'needs ANTHROPIC_API_KEY (or CLAUDE_API_KEY), MANAGED_AGENT_ID, MANAGED_AGENT_ENVIRONMENT_ID and GAMEDEV_CREATOR_KEY',
    );
  }
  const model = value('model') ?? process.env.MANAGED_AGENT_MODEL?.trim() ?? 'claude-sonnet-5-5';
  const effort = (value('effort') ?? process.env.MANAGED_AGENT_ANTHROPIC_EFFORT?.trim() ?? 'medium') as
    ManagedAgentEffort | undefined;
  const provider = createAnthropicManagedProvider({
    apiKey,
    model,
    agentId,
    environmentId,
    maxListCostCents: maxCents,
    overrideTools: true,
  });

  const outDir = path.resolve(
    value('out') ?? path.join(repoRoot, '.builder-runs', new Date().toISOString().replace(/[:.]/g, '-')),
  );
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'system-prompt.md'), systemPrompt);
  log(`run dir ${outDir}; ${briefs.length} brief(s) x ${runs}, model ${model} ${effort ?? ''}`);

  const live = new Map<string, string | undefined>();
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      stopping = true;
      log(`${signal}: interrupting ${live.size} session(s)`);
    });
  }

  const results: unknown[] = [];
  for (const brief of briefs) {
    for (let run = 1; run <= runs && !stopping; run++) {
      const label = runs > 1 ? `${brief.id}#${run}` : brief.id;
      const prompt = kickoff(brief);
      const started = Date.now();
      const session = await provider.startSession({
        correlationId: `hc-${brief.id}-${started}`,
        systemPrompt,
        prompt,
        model,
        ...(effort ? { effort } : {}),
        tools: { mcpEndpoints: [{ url: mcpUrl, name: 'gamedevpl' }] },
        mcpBearerCredential: { url: mcpUrl, token: creatorKey },
        title: `hillclimb/${label}`,
      });
      live.set(session.id, session.credentialRef);
      log(`[${label}] session ${session.id}`);
      let timedOut = false;
      let idle = 0;
      try {
        while (!stopping) {
          await sleep(10_000);
          const state = await provider.getSession(session.id).catch(() => null);
          if (!state || ['completed', 'failed', 'timed_out', 'cancelled'].includes(state.state)) break;
          idle = state.state === 'idle' && state.stopReason !== 'requires_action' ? idle + 1 : 0;
          if (idle >= 2) break;
          if (Date.now() - started > maxMinutes * 60_000) {
            timedOut = true;
            break;
          }
        }
        if (timedOut || stopping) await provider.cancelSession(session.id).catch(() => undefined);
      } finally {
        if (session.credentialRef) await provider.releaseCredential?.(session.credentialRef).catch(() => undefined);
        live.delete(session.id);
      }
      const minutes = Math.round((Date.now() - started) / 6000) / 10;
      const exported = await sessionEvents(apiKey, session.id);
      const created = toolResults(exported.events, 'create_game')[0];
      const startResult = toolResults(exported.events, 'start').at(-1);
      const submits = toolResults(exported.events, 'submit_sources');
      const slug = (created?.slug ?? startResult?.slug) as string | undefined;
      const sessionKey = startResult?.sessionKey as string | undefined;
      let gate: unknown = submits.length ? 'pending' : null;
      // Gate verdicts land 2-5 minutes after submit_sources.
      for (let attempt = 0; submits.length && sessionKey && attempt < 8 && !stopping; attempt++) {
        gate = await mcpTool(mcpUrl, creatorKey, 'get_gate_verdict', { sessionKey }).catch((error: unknown) => ({
          error: String(error),
        }));
        const status = (gate as { status?: string; green?: boolean }).status ?? '';
        if (!/pending|running|queued/.test(status)) break;
        await sleep(45_000);
      }
      const result = {
        id: label,
        session: session.id,
        slug,
        timedOut,
        minutes,
        submits: submits.length,
        gate,
        score: scoreSession(exported.events),
        ...(exported.error ? { exportError: exported.error } : {}),
      };
      results.push(result);
      const dir = path.join(outDir, label.replace('#', '-'));
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'kickoff.md'), prompt);
      await writeFile(path.join(dir, 'events.json'), JSON.stringify(exported.events, null, 2));
      await writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
      await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2));
      const verdict = (gate as { status?: string } | null)?.status ?? (gate === null ? 'no delivery' : 'unknown');
      log(`[${label}] done in ${minutes} min, slug ${slug ?? '-'}, gate ${verdict}`);
    }
  }
  log(`summary: ${path.join(outDir, 'summary.json')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
