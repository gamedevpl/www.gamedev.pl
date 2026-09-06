import { detectAdapter, loadAdapters, whichOnPath, type AdapterFile } from './adapters.js';

export type AgentAvailability = {
  name: string;
  command: string;
  installed: boolean;
  local: boolean;
  mcp: boolean;
};

const DISCOVERY_ONLY = [{ name: 'cursor-editor', command: 'cursor' }];

export function adapterMcpSupported(name: string): boolean {
  return name === 'claude' || name === 'codex' || name === 'copilot';
}

export function discoverAgents(
  env: NodeJS.ProcessEnv = process.env,
  which: (command: string) => string | null = (command) => whichOnPath(command, env),
  file: AdapterFile = loadAdapters(env),
): AgentAvailability[] {
  const registered = file.adapters.map(({ name, command }) => ({ name, command }));
  const known = [...registered, ...DISCOVERY_ONLY.filter((row) => !registered.some((spec) => spec.name === row.name))];
  return known.map(({ name, command }) => ({
    name,
    command,
    installed: registered.some((spec) => spec.name === name)
      ? detectAdapter(name, which, file) !== null
      : which(command) !== null,
    local: registered.some((spec) => spec.name === name),
    mcp: registered.some((spec) => spec.name === name) && adapterMcpSupported(name),
  }));
}

export function formatAgents(agents: AgentAvailability[]): string {
  const lines = agents.map((agent) => {
    const modes = [agent.local ? 'local files' : '', agent.mcp ? 'MCP' : ''].filter(Boolean).join(' + ');
    return `${agent.name}: ${agent.installed ? 'found' : 'not on PATH'} — ${modes || 'no execution adapter configured'}`;
  });
  return [
    ...lines,
    '',
    'Discovery checks executable files; launch verifies required CLI flags. Provider login is managed by the agent.',
    'Local files: gamedevpl delegate "<task>" --agent <name> inside a checkout.',
    'MCP: gamedevpl connect <slug> --agent <name>. The round must use builder self.',
    'Agent runs use that tool’s own credentials and billing.',
  ].join('\n');
}

export function agentHint(agents: AgentAvailability[]): string | null {
  const names = agents.filter((row) => row.installed && (row.local || row.mcp)).map((row) => row.name);
  return names.length ? `local agents: ${names.join(', ')} — /agents shows local-file and MCP options` : null;
}
