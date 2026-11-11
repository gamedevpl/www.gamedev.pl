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
