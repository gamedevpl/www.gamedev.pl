// One managed round, stub vendor. Usage: docs/managed-agent-backend.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildBrief } from '../src/agent-backend.js';
import { mintManagedMcpOpener } from '../src/agent-token.js';
import { buildPrompt } from '../src/build-prompt.js';
import {
  createManagedProvider,
  type ManagedAgentProvider,
  type ManagedOutputRef,
  type ManagedSession,
} from '../src/managed-agent.js';
import '../src/managed-provider-anthropic.js';
import '../src/managed-provider-copilot.js';
import '../src/managed-provider-gemini.js';
import { createManagedBackend, type ManagedDeliveryInput } from '../src/managed-backend.js';
import { createFileKitDigestLoader } from '../src/kit-digest.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);

const creation = flag('create');
const SLUG = creation ? undefined : (value('slug') ?? 'comet-courier');
const ISSUE = Number(value('issue') ?? 4242);
const CREATE_TITLE = value('title') ?? 'Managed Probe Courier';
const CREATE_CONCEPT =
  value('concept') ??
  'Guide a small courier ship across a bright sky, collect parcels, and dodge drifting clouds before reaching the beacon.';
const outDir = value('out');
const digestPath = value('digest-file');
const vendor = value('vendor');
const apiBaseUrl = (
  value('base-url') ??
  (vendor === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://api.anthropic.com')
).replace(/\/$/, '');
const wait = flag('wait');
const waitSeconds = Number(value('wait-seconds') ?? process.env.MANAGED_AGENT_MAX_SECONDS ?? '');
const budgetUsd = Number(value('budget-usd') ?? process.env.MANAGED_AGENT_MAX_LIST_BUDGET_USD ?? '');
const budgetCredits = Number(value('budget-credits') ?? process.env.MANAGED_AGENT_COPILOT_MAX_CREDITS ?? '');
const budgetTokens = Number(value('budget-tokens') ?? process.env.MANAGED_AGENT_MAX_TOTAL_TOKENS ?? '');
const vaultIds = (process.env.MANAGED_AGENT_VAULT_IDS ?? process.env.MANAGED_AGENT_VAULT_ID)
  ?.split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const mcpOnly = flag('mcp');
const mcpUrl = (value('mcp-url') ?? process.env.MANAGED_AGENT_MCP_URL ?? 'https://www.gamedev.pl/api/mcp').replace(
  /\/$/,
  '',
);
const roundGeneration = Number(value('round-generation') ?? 1);
const openerSecret =
  process.env.SUBMISSION_TOKEN_SECRET?.trim() ||
  process.env.MANAGED_PROBE_OPENER_SECRET?.trim() ||
  'probe-mcp-opener-secret';
const usingProdOpenerSecret = Boolean(process.env.SUBMISSION_TOKEN_SECRET?.trim());
const rule = (title: string) => console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);

if (mcpOnly && (!Number.isSafeInteger(ISSUE) || ISSUE <= 0)) {
  console.error('--mcp needs a positive --issue (job id) for the opener token');
  process.exit(1);
}
if (mcpOnly && (!Number.isSafeInteger(roundGeneration) || roundGeneration < 1)) {
  console.error('--round-generation must be a positive integer');
  process.exit(1);
}
if (vendor === 'copilot' && flag('override-tools')) {
  console.error('Copilot does not accept --override-tools');
  process.exit(1);
}

const mcpOpenerToken = mcpOnly ? mintManagedMcpOpener(ISSUE, openerSecret, { roundGeneration }) : undefined;

const brief: BuildBrief = {
  issueNumber: ISSUE,
  roundGeneration,
  ...(SLUG ? { slug: SLUG } : {}),
  ...(creation ? { createGame: { title: CREATE_TITLE, concept: CREATE_CONCEPT } } : {}),
  spec: value('spec') ?? CREATE_CONCEPT,
  channelToken: 'tok_probe',
  ...(mcpOpenerToken ? { mcpOpenerToken } : {}),
  apiBaseUrl: 'http://127.0.0.1:3001',
  ...(mcpOnly ? { promptLane: 'mcp' as const } : {}),
  ...(flag('feedback') ? { feedback: 'make the comets bigger' } : {}),
};
const manifestPath = fileURLToPath(new URL('../../../infra/managed-agent.json', import.meta.url));
const manifest = digestPath
  ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { agent?: { system?: string } })
  : undefined;

if (flag('prompt')) {
  rule('brief — channel contract');
  console.log(buildPrompt(brief, { kind: 'channel' }));
  rule('brief — outputs contract');
  console.log(buildPrompt(brief, { kind: 'outputs', path: 'outputs' }));
  process.exit(0);
}

// Parks idle, bills tokens, lists before reading — as the contract says.
function stubProvider(): ManagedAgentProvider {
  const files = new Map<string, string>([
    [`games/${SLUG}/game.ts`, 'export const game = () => {};\n'],
    [`games/${SLUG}/SPEC.md`, `# ${SLUG}\n\nDeliver parcels between comets.\n`],
    [`games/${SLUG}/media/cover.png`, 'not-really-a-png'],
    ['scratch/notes.md', 'kept out of the delivery by the path mapping'],
  ]);
  let polls = 0;
  return {
    vendor: 'stub',
    model: 'stub-model',
    promptLane: 'outputs',
    async startSession(request) {
      rule('startSession');
      console.log(`model            ${request.model}`);
      console.log(`correlationId    ${request.correlationId}`);
      console.log(`outputPath       ${request.outputPath}`);
      console.log(`systemPrompt     ${request.systemPrompt ? `${request.systemPrompt.length} chars` : '(none)'}`);
      console.log(`workspaceFiles   ${request.workspaceFiles?.length ?? 0}`);
      console.log(`mcpEndpoints     ${request.tools?.mcpEndpoints?.map((e) => e.url).join(', ') || '(none)'}`);
      console.log(
        `mcpBearer        ${request.mcpBearerCredential ? `url=${request.mcpBearerCredential.url} token=${request.mcpBearerCredential.token.length} chars` : '(none)'}`,
      );
      console.log(`prompt           ${request.prompt.length} chars — run with --prompt to read it`);
      return {
        id: 'stub-session-1',
        state: 'queued',
        ...(request.mcpBearerCredential ? { credentialRef: 'stub-vault-1' } : {}),
      };
    },
    async getSession(): Promise<ManagedSession> {
      polls += 1;
      // Second poll parks, which is when a harvest is due.
      return {
        id: 'stub-session-1',
        state: polls === 1 ? 'in_progress' : 'idle',
        vendorState: polls === 1 ? 'running' : 'status_idle',
        usage: {
          unit: 'tokens',
          vendor: 'stub',
          inputTokens: 1_240_000,
          outputTokens: 18_400,
          model: 'stub-model',
        },
      };
    },
    async listOutputs(): Promise<ManagedOutputRef[]> {
      return [...files].map(([path, content]) => ({
        path,
        handle: path,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
      }));
    },
    async readOutput(_sessionId, ref) {
      const content = files.get(ref.handle ?? ref.path);
      if (content === undefined) throw new Error(`stub has no output ${ref.path}`);
      console.log(`  read  ${ref.path} (${ref.sizeBytes ?? '?'} bytes)`);
      return content;
    },
    async cancelSession() {
      return { enforced: true };
    },
    async releaseCredential(credentialRef) {
      console.log(`released credential ${credentialRef}`);
    },
    async deleteSession() {},
  };
}

const apiKey =
  process.env.MANAGED_AGENT_API_KEY?.trim() ??
  (vendor === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY?.trim()
    : vendor === 'copilot'
      ? process.env.AGENT_TASKS_TOKEN?.trim()
      : vendor === 'gemini'
        ? process.env.GEMINI_API_KEY?.trim()
        : undefined);
const model =
  value('model') ??
  (vendor === 'copilot' ? process.env.AGENT_TASKS_MODEL?.trim() : process.env.MANAGED_AGENT_MODEL?.trim()) ??
  (vendor === 'anthropic'
    ? 'claude-sonnet-5'
    : vendor === 'copilot'
      ? 'claude-sonnet-4.6'
      : vendor === 'gemini'
        ? 'gemini-3.7-flash'
        : undefined);
if (vendor && (!apiKey || !model)) {
  console.error(`--vendor ${vendor} needs an API key and model`);
  process.exit(1);
}
if (
  wait &&
  (!Number.isInteger(waitSeconds) ||
    waitSeconds <= 0 ||
    (vendor === 'copilot'
      ? !Number.isFinite(budgetCredits) || budgetCredits <= 0
      : vendor === 'gemini'
        ? !Number.isSafeInteger(budgetTokens) || budgetTokens <= 0
        : !Number.isFinite(budgetUsd) || budgetUsd <= 0))
) {
  console.error(
    vendor === 'copilot'
      ? '--wait requires positive --wait-seconds and --budget-credits values'
      : vendor === 'gemini'
        ? '--wait requires positive --wait-seconds and --budget-tokens values'
        : '--wait requires positive --wait-seconds and --budget-usd values',
  );
  process.exit(1);
}
// MCP rounds override the Agent tool list, like production.
const overrideTools = mcpOnly || flag('override-tools');
const provider = vendor
  ? createManagedProvider(vendor, {
      apiKey: apiKey!,
      model: model!,
      ...(vendor === 'copilot'
        ? {
            repo: process.env.GAMES_REPO?.trim() ?? 'gamedevpl/www.gamedev.pl-games',
            baseRef: process.env.GAMES_PUBLISHED_REF?.trim() || 'main',
            customAgent: process.env.AGENT_CUSTOM_AGENT?.trim() || 'game-builder',
            createPullRequest: false,
          }
        : {}),
      ...(process.env.MANAGED_AGENT_ID ? { agentId: process.env.MANAGED_AGENT_ID.trim() } : {}),
      ...(process.env.MANAGED_AGENT_ENVIRONMENT_ID
        ? { environmentId: process.env.MANAGED_AGENT_ENVIRONMENT_ID.trim() }
        : {}),
      ...(Number.isFinite(budgetUsd) && budgetUsd > 0
        ? { maxListCostCents: Math.max(1, Math.round(budgetUsd * 100)) }
        : {}),
      ...(Number.isSafeInteger(budgetTokens) && budgetTokens > 0
        ? { budget: { unit: 'tokens' as const, max: budgetTokens } }
        : {}),
      ...(vaultIds?.length ? { vaultIds } : {}),
      ...(overrideTools ? { overrideTools: true } : {}),
      baseUrl: apiBaseUrl,
    })
  : stubProvider();

const delivered: ManagedDeliveryInput[] = [];

const backend = createManagedBackend({
  provider,
  // Stands in for the submit_sources route, still to be extracted.
  ...(mcpOnly
    ? {
        tools: { mcpEndpoints: [{ url: mcpUrl, name: 'gamedevpl' }] },
        ...(vendor === 'copilot'
          ? {}
          : {
              // Per-round vault holds the opener, as in production.
              mcpBearerCredential: (input) =>
                input.mcpOpenerToken ? { url: mcpUrl, token: input.mcpOpenerToken } : undefined,
            }),
      }
    : {
        deliver: async (input) => {
          delivered.push(input);
          return { version: 'probe-v1' };
        },
      }),
  log: {
    warn: (context, message) => console.warn('WARN ', message, context),
    info: (context, message) => console.log('INFO ', message, context),
  },
  ...(manifest?.agent?.system ? { systemPrompt: async () => manifest.agent!.system } : {}),
  ...(digestPath ? { kitDigest: createFileKitDigestLoader(digestPath) } : {}),
  ...(wait ? { maxDurationSeconds: waitSeconds } : {}),
  ...(mcpOnly ? { promptLane: 'mcp' as const } : {}),
  ...(vendor === 'copilot' && Number.isFinite(budgetCredits) && budgetCredits > 0
    ? { budget: { unit: 'credits' as const, max: budgetCredits } }
    : {}),
  ...(vendor === 'gemini' && Number.isSafeInteger(budgetTokens) && budgetTokens > 0
    ? { budget: { unit: 'tokens' as const, max: budgetTokens } }
    : {}),
  // The probe cannot see MCP deliveries, so nudging would mislead.
  ...(mcpOnly && !flag('nudge') ? { nudgeIdle: false } : {}),
});

rule(`probe — backend ${backend.name}${mcpOnly ? ' (MCP shape)' : ' (pull shape)'}`);
if (mcpOnly) {
  console.log(`mcpUrl           ${mcpUrl}`);
  console.log(`issue            ${ISSUE}  roundGeneration ${roundGeneration}`);
  console.log(
    `opener           ${usingProdOpenerSecret ? 'SUBMISSION_TOKEN_SECRET (may auth live MCP)' : 'probe-local secret (Anthropic vault proof only)'}`,
  );
  if (!usingProdOpenerSecret) {
    console.log(
      'note             Live MCP start against prod still needs SUBMISSION_TOKEN_SECRET + a real Firestore job.',
    );
  }
}

const dispatch = await backend.dispatch(brief);
console.log(`\nref              ${dispatch.ref}`);
console.log(`credentialRef    ${dispatch.credentialRef ?? '(none)'}`);
if (mcpOnly && vendor === 'anthropic' && !dispatch.credentialRef) {
  console.warn('WARN  expected a per-round vault credentialRef when --mcp is set for Anthropic');
}

const pollCount = wait ? Math.ceil((waitSeconds * 1000) / 5000) + 1 : 2;
const timeline: Array<{ at: string; state: string; candidate: boolean }> = [];
for (let attempt = 1; attempt <= pollCount; attempt += 1) {
  if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 5000));
  rule(`observe #${attempt}`);
  const observation = await backend.observe(dispatch.ref, {
    hasCandidate: delivered.length > 0,
    issueNumber: ISSUE,
    slug: SLUG,
    roundGeneration,
  });
  if (observation) {
    const entry = { at: new Date().toISOString(), state: observation.state, candidate: observation.hasCandidate };
    timeline.push(entry);
    console.log(`${entry.at}  ${entry.state}  candidate=${entry.candidate}`);
    console.log(observation);
  } else {
    console.log('(vendor has forgotten this session)');
  }
  if (
    observation &&
    (observation.hasCandidate || ['idle', 'failed', 'timed_out', 'cancelled'].includes(observation.state))
  )
    break;
}

rule('state-transition timeline');
for (const entry of timeline) console.log(`${entry.at}  ${entry.state}  candidate=${entry.candidate}`);

rule('what the platform would store');
if (delivered.length === 0) {
  console.log(
    mcpOnly
      ? 'Nothing pulled, as designed: in the MCP shape the agent calls submit_sources itself.'
      : 'Nothing delivered. A settled session with no candidate fails the round.',
  );
} else {
  for (const input of delivered) {
    console.log(`issue ${input.issueNumber}  slug ${input.slug}  mode ${input.mode}  session ${input.sessionRef}`);
    for (const file of input.files) console.log(`  ${file.path}  ${Buffer.byteLength(file.content, 'utf8')} bytes`);
    if (outDir) {
      for (const file of input.files) {
        const target = join(outDir, file.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.content);
      }
      console.log(`\nwrote ${input.files.length} file(s) under ${outDir}`);
    }
  }
}

// A deleted session takes the only record of what the agent tried.
if (vendor === 'anthropic') {
  rule('session transcript');
  let mcpStartOk = 0;
  let mcpStartErr = 0;
  try {
    const response = await fetch(`${apiBaseUrl}/v1/sessions/${dispatch.ref}/events`, {
      headers: {
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'managed-agents-2026-04-01',
      },
    });
    const body = (await response.json()) as { data?: unknown[] };
    const events = (Array.isArray(body) ? body : (body.data ?? [])) as Record<string, unknown>[];
    const started = events.length ? Date.parse(String(events[0].processed_at)) : 0;
    for (const event of events) {
      const type = String(event.type);
      if (!['agent.tool_use', 'agent.mcp_tool_use', 'agent.mcp_tool_result', 'agent.message'].includes(type)) continue;
      const at = ((Date.parse(String(event.processed_at)) - started) / 1000).toFixed(1);
      const toolName = String(event.name ?? '');
      const detail =
        type === 'agent.mcp_tool_use'
          ? `mcp:${toolName}`
          : type === 'agent.mcp_tool_result'
            ? event.is_error
              ? `ERROR ${String((event.content as { text?: string }[] | undefined)?.[0]?.text ?? '').slice(0, 120)}`
              : 'ok'
            : String(
                (event.input as { command?: string } | undefined)?.command ??
                  (event.content as { text?: string }[] | undefined)?.[0]?.text ??
                  '',
              )
                .slice(0, 100)
                .replace(/\n/g, ' ');
      if (type === 'agent.mcp_tool_result' && (toolName === 'start' || toolName.endsWith(':start'))) {
        if (event.is_error) mcpStartErr += 1;
        else mcpStartOk += 1;
      }
      console.log(`${at.padStart(6)}s  ${type}  ${detail}`);
    }
    if (events.length === 0) console.log('(no events returned)');
    if (mcpOnly) {
      console.log(
        `\nmcp:start summary  ok=${mcpStartOk} error=${mcpStartErr}${
          mcpStartOk + mcpStartErr === 0 ? ' (no start call in transcript yet)' : ''
        }`,
      );
    }
  } catch (error) {
    console.warn('could not read the transcript:', error);
  }
}

rule('cancel + cleanup');
console.log(await backend.cancel(dispatch.ref, dispatch.credentialRef));
if (flag('keep')) {
  console.log(`kept ${dispatch.ref} — inspect it in the console, then delete it yourself`);
} else {
  await backend.cleanup?.(dispatch);
}
console.log('cleanup done');
