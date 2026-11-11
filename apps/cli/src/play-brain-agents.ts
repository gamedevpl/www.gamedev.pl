import type { AgentTask, CodingAgent } from 'genaicode/agents';
import { modePermissions, type PermissionMode } from './agent-permissions.js';
import { readAgentSelection, readFallback, validateSelection } from './agent-settings.js';

// /fallback picks: installed Play agents other than the current one.
export function playFallback(
  env: NodeJS.ProcessEnv,
  current: string,
  installed: ReadonlyArray<{ name: string }>,
  playAgents: readonly string[],
): string[] {
  return readFallback(env).filter(
    (other) =>
      other !== current && playAgents.includes(other) && installed.some((candidate) => candidate.name === other),
  );
}

// Agents passing their preflight, in order; none left rethrows the first refusal.
export async function usableAgents(
  order: readonly string[],
  check: (name: string) => Promise<void>,
  skipped: (name: string, error: unknown) => void,
): Promise<string[]> {
  const kept: string[] = [];
  let refused: { error: unknown } | undefined;
  for (const name of order) {
    try {
      await check(name);
      kept.push(name);
    } catch (error) {
      refused ??= { error };
      skipped(name, error);
    }
  }
  if (!kept.length) throw refused!.error;
  return kept;
}

// Runs use /model's selection and the permission mode, like the workshop.
export function withRunSettings(
  make: (permissions?: AgentTask['permissions']) => CodingAgent | undefined,
  env: NodeJS.ProcessEnv,
  mode: () => PermissionMode,
): CodingAgent | undefined {
  const agent = make();
  if (!agent) return undefined;
  const run: CodingAgent['run'] = (task) => {
    const selection = readAgentSelection(agent.name, env);
    validateSelection(agent.name, selection);
    const permissions = modePermissions(mode());
    return (permissions ? make(permissions)! : agent).run({
      ...task,
      ...(permissions ? { permissions } : {}),
      ...(selection.model && !task.model ? { model: selection.model } : {}),
      ...(selection.effort && !task.effort ? { effort: selection.effort } : {}),
    });
  };
  return Object.assign(Object.create(agent) as CodingAgent, { run });
}
