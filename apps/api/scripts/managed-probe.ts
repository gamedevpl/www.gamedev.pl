// One managed round over MCP. Usage: docs/managed-agent-backend.md.

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { BuildBrief } from '../src/agent-backend.js';
import { mintManagedMcpOpener } from '../src/agent-token.js';
import { buildPrompt } from '../src/delivery/build-prompt.js';
import { createManagedProvider } from '../src/managed-agent.js';
import '../src/managed-provider-anthropic.js';
import '../src/managed-provider-copilot.js';
import '../src/managed-provider-gemini.js';
import '../src/managed-provider-openai.js';
import { createManagedBackend } from '../src/managed-backend.js';
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
const digestPath = value('digest-file');
const vendor = value('vendor');
if (!vendor) {
  console.error('--vendor anthropic|gemini|copilot|openai is required — every managed round dispatches over MCP.');
  process.exit(1);
}
const apiBaseUrl = (
  value('base-url') ??
  (vendor === 'gemini'
    ? 'https://generativelanguage.googleapis.com/v1beta'
    : vendor === 'openai'
      ? 'https://api.openai.com/v1'
      : 'https://api.anthropic.com')
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

if (!Number.isSafeInteger(ISSUE) || ISSUE <= 0) {
  console.error('needs a positive --issue (job id) for the opener token');
  process.exit(1);
}
if (!Number.isSafeInteger(roundGeneration) || roundGeneration < 1) {
  console.error('--round-generation must be a positive integer');
  process.exit(1);
}
if (vendor === 'copilot' && flag('override-tools')) {
  console.error('Copilot does not accept --override-tools');
  process.exit(1);
}

const mcpOpenerToken = mintManagedMcpOpener(ISSUE, openerSecret, { roundGeneration });

const brief: BuildBrief = {
  issueNumber: ISSUE,
  roundGeneration,
  ...(SLUG ? { slug: SLUG } : {}),
  ...(creation ? { createGame: { title: CREATE_TITLE, concept: CREATE_CONCEPT } } : {}),
  spec: value('spec') ?? CREATE_CONCEPT,
  channelToken: 'tok_probe',
  mcpOpenerToken,
  apiBaseUrl: 'http://127.0.0.1:3001',
  ...(flag('feedback') ? { feedback: 'make the comets bigger' } : {}),
};
const manifestPath = fileURLToPath(new URL('../../../infra/managed-agent.json', import.meta.url));
const manifest = digestPath
  ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { agent?: { system?: string } })
  : undefined;

if (flag('prompt')) {
  console.log(buildPrompt(brief));
  process.exit(0);
}

const apiKey =
  process.env.MANAGED_AGENT_API_KEY?.trim() ??
  (vendor === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY?.trim()
    : vendor === 'copilot'
      ? process.env.AGENT_TASKS_TOKEN?.trim()
      : vendor === 'gemini'
        ? process.env.GEMINI_API_KEY?.trim()
        : vendor === 'openai'
          ? process.env.OPENAI_API_KEY?.trim()
          : undefined);
const model =
  value('model') ??
  (vendor === 'copilot'
    ? process.env.AGENT_TASKS_MODEL?.trim()
    : vendor === 'openai'
      ? process.env.MANAGED_AGENT_OPENAI_MODEL?.trim()
      : vendor === 'gemini'
        ? process.env.MANAGED_AGENT_GEMINI_MODEL?.trim()
        : process.env.MANAGED_AGENT_MODEL?.trim()) ??
  (vendor === 'anthropic'
    ? 'claude-sonnet-5'
    : vendor === 'copilot'
      ? 'claude-sonnet-4.6'
      : vendor === 'gemini'
        ? 'gemini-3.7-flash'
        : undefined);
if (!apiKey || !model) {
  console.error(`--vendor ${vendor} needs an API key and model`);
  process.exit(1);
}
if (vendor === 'copilot' && !process.env.MANAGED_AGENT_COPILOT_MCP_REPO?.trim()) {
  console.error('--vendor copilot needs MANAGED_AGENT_COPILOT_MCP_REPO (the scratch repo it dispatches into)');
  process.exit(1);
}
const usesTokenBudget = vendor === 'gemini' || vendor === 'openai';
if (
  wait &&
  (!Number.isInteger(waitSeconds) ||
    waitSeconds <= 0 ||
    (vendor === 'copilot'
      ? !Number.isFinite(budgetCredits) || budgetCredits <= 0
      : usesTokenBudget
        ? !Number.isSafeInteger(budgetTokens) || budgetTokens <= 0
        : !Number.isFinite(budgetUsd) || budgetUsd <= 0))
) {
  console.error(
    vendor === 'copilot'
      ? '--wait requires positive --wait-seconds and --budget-credits values'
      : usesTokenBudget
        ? '--wait requires positive --wait-seconds and --budget-tokens values'
        : '--wait requires positive --wait-seconds and --budget-usd values',
  );
  process.exit(1);
}
// Every round overrides the agent's own tool list, like production.
const overrideTools = vendor !== 'copilot' || flag('override-tools');
const provider = createManagedProvider(vendor, {
  apiKey,
  model,
  ...(vendor === 'copilot'
    ? {
        mcpRepo: process.env.MANAGED_AGENT_COPILOT_MCP_REPO!.trim(),
        ...(process.env.MANAGED_AGENT_COPILOT_MCP_BASE_REF?.trim()
          ? { mcpBaseRef: process.env.MANAGED_AGENT_COPILOT_MCP_BASE_REF.trim() }
          : {}),
        ...(process.env.MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT?.trim()
          ? { mcpCustomAgent: process.env.MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT.trim() }
          : {}),
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
});

const backend = createManagedBackend({
  provider,
  tools: { mcpEndpoints: [{ url: mcpUrl, name: 'gamedevpl' }] },
  ...(vendor === 'copilot'
    ? {}
    : {
        // Per-round vault holds the opener, as in production.
        mcpBearerCredential: (input) =>
          input.mcpOpenerToken ? { url: mcpUrl, token: input.mcpOpenerToken } : undefined,
      }),
  log: {
    warn: (context, message) => console.warn('WARN ', message, context),
    info: (context, message) => console.log('INFO ', message, context),
  },
  ...(manifest?.agent?.system ? { systemPrompt: async () => manifest.agent!.system } : {}),
  ...(digestPath ? { kitDigest: createFileKitDigestLoader(digestPath) } : {}),
  ...(wait ? { maxDurationSeconds: waitSeconds } : {}),
  ...(vendor === 'copilot' && Number.isFinite(budgetCredits) && budgetCredits > 0
    ? { budget: { unit: 'credits' as const, max: budgetCredits } }
    : {}),
  ...(usesTokenBudget && Number.isSafeInteger(budgetTokens) && budgetTokens > 0
    ? { budget: { unit: 'tokens' as const, max: budgetTokens } }
    : {}),
  // The probe cannot see the MCP submit_sources call, so nudging would mislead.
  ...(!flag('nudge') ? { nudgeIdle: false } : {}),
});

rule(`probe — backend ${backend.name} (MCP)`);
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

const dispatch = await backend.dispatch(brief);
console.log(`\nref              ${dispatch.ref}`);
console.log(`credentialRef    ${dispatch.credentialRef ?? '(none)'}`);
if (vendor === 'anthropic' && !dispatch.credentialRef) {
  console.warn('WARN  expected a per-round vault credentialRef for Anthropic');
}

const pollCount = wait ? Math.ceil((waitSeconds * 1000) / 5000) + 1 : 2;
const timeline: Array<{ at: string; state: string; candidate: boolean }> = [];
for (let attempt = 1; attempt <= pollCount; attempt += 1) {
  if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 5000));
  rule(`observe #${attempt}`);
  const observation = await backend.observe(dispatch.ref, {
    hasCandidate: false,
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

rule('delivery');
console.log('The agent delivers over MCP (submit_sources) — this probe has no visibility into that call.');

// A deleted session takes the only record of what the agent tried.
if (vendor === 'anthropic') {
  rule('session transcript');
  let mcpStartOk = 0;
  let mcpStartErr = 0;
  try {
    const response = await fetch(`${apiBaseUrl}/v1/sessions/${dispatch.ref}/events`, {
      headers: {
        'x-api-key': apiKey,
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
    console.log(
      `\nmcp:start summary  ok=${mcpStartOk} error=${mcpStartErr}${
        mcpStartOk + mcpStartErr === 0 ? ' (no start call in transcript yet)' : ''
      }`,
    );
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
