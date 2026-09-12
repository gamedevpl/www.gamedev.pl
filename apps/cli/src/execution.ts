import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ApiClient } from './api.js';
import { adapterMcpSupported } from './agents.js';
import { preflightAdapter, type AdapterSpec } from './adapters.js';
import { checkoutGame } from './checkout.js';
import { connectGame } from './connect.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { detectLocalAdapters, workshopTurn, type Workshop, type PickChoice } from './workshop.js';
import type { CliTelemetry } from './telemetry.js';
import { readAgentSelection } from './agent-settings.js';
import { modelCommand } from './model-command.js';

export type ExecutionChoice = { builder: 'platform' } | { builder: 'self'; spec: AdapterSpec; mode: 'local' | 'mcp' };

export type PendingExecution = { current?: { choice: ExecutionChoice; request: string } };

export function executionSettingsLabel(spec: AdapterSpec, env: NodeJS.ProcessEnv): string {
  const selection = readAgentSelection(spec.name, env);
  return `model: ${selection.model ?? 'agent default*'}; effort: ${selection.effort ?? 'agent default*'}`;
}

export async function chooseExecution(input: {
  env: NodeJS.ProcessEnv;
  pick: PickChoice;
  workshop?: Workshop;
  telemetry?: CliTelemetry;
  write?: (line: string) => void;
}): Promise<ExecutionChoice | null> {
  const adapters = input.workshop?.adapters ?? detectLocalAdapters(input.env);
  if (!adapters.length) return { builder: 'platform' };
  if (input.workshop?.selectedAgent) {
    const spec = adapters.find((row) => row.name === input.workshop!.selectedAgent);
    if (spec) return { builder: 'self', spec, mode: 'local' };
  }
  for (const spec of adapters) input.telemetry?.record('delegate_offered', { adapter: spec.name });
  const platform = 'gamedev.pl builder — uses platform quota';
  const configure = 'Configure agent model and effort…';
  while (true) {
    const local = adapters.map((spec) => {
      const mode = input.workshop ? 'local' : adapterMcpSupported(spec.name) ? 'mcp' : 'local';
      const where = mode === 'mcp' ? 'MCP' : input.workshop ? 'this checkout' : 'download a checkout';
      return {
        choice: { builder: 'self' as const, spec, mode: mode as 'local' | 'mcp' },
        label: `${spec.name} — ${executionSettingsLabel(spec, input.env)} — ${where}; own billing`,
      };
    });
    const chosen = await input.pick(
      [...local.map((row) => row.label), configure, platform],
      'Who should build this task? (* agent defaults may not be reported)',
    );
    if (chosen === configure) {
      await modelCommand({
        args: [],
        flags: {},
        env: input.env,
        pick: input.pick,
        write: input.write ?? (() => undefined),
      });
      continue;
    }
    if (chosen === platform) return { builder: 'platform' };
    const choice = local.find((row) => row.label === chosen)?.choice;
    if (!choice) return null;
    if (!input.workshop?.runAdapter) preflightAdapter(choice.spec, input.env);
    if (input.workshop) input.workshop.selectedAgent = choice.spec.name;
    return choice;
  }
}

export async function executeChoice(input: {
  api: ApiClient;
  choice: ExecutionChoice;
  slug: string;
  token: string;
  request: string;
  env: NodeJS.ProcessEnv;
  pick: PickChoice;
  write: (line: string) => void;
  workshop?: Workshop;
  abort: Workshop['abort'];
  telemetry?: CliTelemetry;
  onWorkshop?: (ws: Workshop) => void;
}): Promise<Workshop | undefined> {
  if (input.choice.builder === 'platform') return input.workshop;
  const { spec, mode } = input.choice;
  if (mode === 'mcp') {
    const controller = new AbortController();
    input.abort.current = controller;
    try {
      await connectGame({
        api: input.api,
        slug: input.slug,
        dest: process.cwd(),
        env: input.env,
        agent: spec.name,
        abort: controller.signal,
        write: input.write,
        telemetry: input.telemetry,
      });
    } finally {
      input.abort.current = null;
    }
    return;
  }
  let ws = input.workshop;
  if (!ws) {
    const root = mkdtempSync(join(tmpdir(), 'gamedev-checkout-'));
    input.write(`downloading ${input.slug} to ${root} — this checkout is kept after exit`);
    await checkoutGame({ api: input.api, slug: input.slug, dest: root, allowUndelivered: true });
    ws = {
      slug: input.slug,
      root,
      token: input.token,
      builder: 'self',
      adapters: detectLocalAdapters(input.env),
      env: input.env,
      pick: input.pick,
      abort: input.abort,
      telemetry: input.telemetry,
    };
  }
  input.onWorkshop?.(ws);
  if (ws.builder !== 'self') throw new CliError('handoff still pending', EXIT_REFUSED, '/builder to refresh');
  await workshopTurn({ api: input.api, ws, request: input.request, agent: spec.name, write: input.write });
  return ws;
}
