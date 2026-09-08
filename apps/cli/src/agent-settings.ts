import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AdapterSpec } from './adapters.js';
import { CliError, EXIT_INPUT } from './exit-codes.js';

export type AgentSelection = { model?: string; effort?: string };
const EFFORTS: Record<string, string[]> = {
  codex: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  muse: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  claude: ['low', 'medium', 'high', 'max'],
  agy: ['low', 'medium', 'high'],
  copilot: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
};
export function effortChoices(agent: string): string[] {
  return EFFORTS[agent] ?? [];
}
function path(env: NodeJS.ProcessEnv): string {
  return join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), '.config'), 'gamedevpl', 'agent-settings.json');
}
function settings(env: NodeJS.ProcessEnv): Record<string, AgentSelection> {
  try {
    return JSON.parse(readFileSync(path(env), 'utf8')) as Record<string, AgentSelection>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}
export function readAgentSelection(agent: string, env: NodeJS.ProcessEnv): AgentSelection {
  return settings(env)[agent] ?? {};
}
export function validateSelection(agent: string, selection: AgentSelection): void {
  if (selection.model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(selection.model))
    throw new CliError('invalid model ID', EXIT_INPUT, 'use the model ID accepted by your agent');
  if (selection.effort && !effortChoices(agent).includes(selection.effort))
    throw new CliError(
      `${agent} does not support effort ${selection.effort}`,
      EXIT_INPUT,
      effortChoices(agent).join(', ') || 'effort is controlled in the agent’s own settings',
    );
}
export function saveAgentSelection(agent: string, selection: AgentSelection, env: NodeJS.ProcessEnv): void {
  validateSelection(agent, selection);
  const all = settings(env);
  all[agent] = selection;
  mkdirSync(dirname(path(env)), { recursive: true, mode: 0o700 });
  writeFileSync(path(env), JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
}
export function selectionLabel(agent: string, selection: AgentSelection): string {
  return `${agent} · model: ${selection.model ? `${selection.model} (requested)` : 'tool default (not reported)'} · effort: ${selection.effort ?? 'tool default (not reported)'}`;
}
export function configureAdapter(spec: AdapterSpec, env: NodeJS.ProcessEnv, override?: AgentSelection): AdapterSpec {
  const selection = { ...readAgentSelection(spec.name, env), ...override };
  validateSelection(spec.name, selection);
  const args: string[] = [];
  if (selection.model && spec.name !== 'vibe') args.push('--model', selection.model);
  if (selection.effort) {
    if (spec.name === 'codex') args.push('-c', `model_reasoning_effort=${JSON.stringify(selection.effort)}`);
    else args.push(spec.name === 'muse' ? '--reasoning-effort' : '--effort', selection.effort);
  }
  const base: string[] = [];
  for (let i = 0; i < spec.headless.length; i += 1) {
    const arg = spec.headless[i]!;
    const key = arg.split('=')[0];
    const replace =
      (selection.model && (key === '--model' || key === '-m')) ||
      (selection.effort && (key === '--effort' || key === '--reasoning-effort')) ||
      (selection.effort &&
        (key === '-c' || key === '--config') &&
        /^model_reasoning_effort=/.test(
          arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : (spec.headless[i + 1] ?? ''),
        ));
    if (replace) {
      if (!arg.includes('=')) i += 1;
    } else base.push(arg);
  }
  const headless = base[0] === 'exec' ? ['exec', ...args, ...base.slice(1)] : [...args, ...base];
  return { ...spec, headless, selection };
}
