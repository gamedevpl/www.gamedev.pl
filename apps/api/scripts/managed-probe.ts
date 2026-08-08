// One managed round, stub vendor. Usage: docs/managed-agent-backend.md.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BuildBrief } from '../src/agent-backend.js';
import { buildPrompt } from '../src/build-prompt.js';
import {
  createManagedProvider,
  type ManagedAgentProvider,
  type ManagedOutputRef,
  type ManagedSession,
} from '../src/managed-agent.js';
import '../src/managed-provider-anthropic.js';
import { createManagedBackend, type ManagedDeliveryInput } from '../src/managed-backend.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);

const SLUG = value('slug') ?? 'comet-courier';
const ISSUE = Number(value('issue') ?? 4242);
const outDir = value('out');
const wait = flag('wait');
const waitSeconds = Number(value('wait-seconds') ?? process.env.MANAGED_AGENT_MAX_SECONDS ?? '');
const maxListCostCents = Number(value('cost-cents') ?? process.env.MANAGED_AGENT_MAX_LIST_COST_CENTS ?? '');
const rule = (title: string) => console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);

const brief: BuildBrief = {
  issueNumber: ISSUE,
  slug: SLUG,
  spec: value('spec') ?? 'Deliver parcels between comets while dodging debris. Two buttons, one screen.',
  channelToken: 'tok_probe',
  apiBaseUrl: 'http://127.0.0.1:3001',
  ...(flag('feedback') ? { feedback: 'make the comets bigger' } : {}),
};

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
    async startSession(request) {
      rule('startSession');
      console.log(`model            ${request.model}`);
      console.log(`correlationId    ${request.correlationId}`);
      console.log(`outputPath       ${request.outputPath}`);
      console.log(`systemPrompt     ${request.systemPrompt ? `${request.systemPrompt.length} chars` : '(none)'}`);
      console.log(`workspaceFiles   ${request.workspaceFiles?.length ?? 0}`);
      console.log(`mcpEndpoints     ${request.tools?.mcpEndpoints?.map((e) => e.url).join(', ') || '(none)'}`);
      console.log(`prompt           ${request.prompt.length} chars — run with --prompt to read it`);
      return { id: 'stub-session-1', state: 'queued' };
    },
    async getSession(): Promise<ManagedSession> {
      polls += 1;
      // Second poll parks, which is when a harvest is due.
      return {
        id: 'stub-session-1',
        state: polls === 1 ? 'in_progress' : 'idle',
        vendorState: polls === 1 ? 'running' : 'status_idle',
        usage: { inputTokens: 1_240_000, outputTokens: 18_400, model: 'stub-model' },
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
    async deleteSession() {},
  };
}

const vendor = value('vendor');
const apiKey =
  process.env.MANAGED_AGENT_API_KEY?.trim() ??
  (vendor === 'anthropic' ? process.env.ANTHROPIC_API_KEY?.trim() : undefined);
const model =
  value('model') ?? process.env.MANAGED_AGENT_MODEL?.trim() ?? (vendor === 'anthropic' ? 'claude-sonnet-5' : undefined);
if (vendor && (!apiKey || !model)) {
  console.error(`--vendor ${vendor} needs an API key and model`);
  process.exit(1);
}
if (
  wait &&
  (!Number.isInteger(waitSeconds) || waitSeconds <= 0 || !Number.isInteger(maxListCostCents) || maxListCostCents <= 0)
) {
  console.error('--wait requires positive --wait-seconds and --cost-cents values');
  process.exit(1);
}
const provider = vendor
  ? createManagedProvider(vendor, {
      apiKey: apiKey!,
      model: model!,
      ...(process.env.MANAGED_AGENT_ID ? { agentId: process.env.MANAGED_AGENT_ID.trim() } : {}),
      ...(process.env.MANAGED_AGENT_ENVIRONMENT_ID
        ? { environmentId: process.env.MANAGED_AGENT_ENVIRONMENT_ID.trim() }
        : {}),
      ...(Number.isInteger(maxListCostCents) && maxListCostCents > 0 ? { maxListCostCents } : {}),
      ...(value('base-url') ? { baseUrl: value('base-url')! } : {}),
    })
  : stubProvider();

const delivered: ManagedDeliveryInput[] = [];
const mcpOnly = flag('mcp');

const backend = createManagedBackend({
  provider,
  // Stands in for the submit_sources route, still to be extracted.
  ...(mcpOnly
    ? { tools: { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] } }
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
  ...(wait ? { maxDurationSeconds: waitSeconds } : {}),
});

rule(`probe — backend ${backend.name}${mcpOnly ? ' (MCP shape)' : ' (pull shape)'}`);

const dispatch = await backend.dispatch(brief);
console.log(`\nref              ${dispatch.ref}`);

const pollCount = wait ? Math.ceil((waitSeconds * 1000) / 5000) + 1 : 2;
for (let attempt = 1; attempt <= pollCount; attempt += 1) {
  if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 5000));
  rule(`observe #${attempt}`);
  const observation = await backend.observe(dispatch.ref, {
    hasCandidate: delivered.length > 0,
    issueNumber: ISSUE,
    slug: SLUG,
  });
  console.log(observation ?? '(vendor has forgotten this session)');
  if (observation && (observation.hasCandidate || ['failed', 'timed_out', 'cancelled'].includes(observation.state)))
    break;
}

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

rule('cancel + cleanup');
console.log(await backend.cancel(dispatch.ref));
await backend.cleanup?.(dispatch);
console.log('cleanup done');
