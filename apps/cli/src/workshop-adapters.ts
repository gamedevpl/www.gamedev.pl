import { detectAdapter, loadAdapters, whichOnPath, type AdapterSpec } from './adapters.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import type { Workshop } from './workshop.js';

export function detectLocalAdapters(
  env: NodeJS.ProcessEnv,
  which: (cmd: string) => string | null = (cmd) => whichOnPath(cmd, env),
): AdapterSpec[] {
  const file = loadAdapters(env);
  return file.adapters.flatMap((row) => {
    const spec = detectAdapter(row.name, which, file);
    return spec ? [spec] : [];
  });
}

export function describeAdapters(adapters: AdapterSpec[], all = loadAdapters().adapters): string {
  if (adapters.length) return `local agents: ${adapters.map((spec) => spec.name).join(', ')}`;
  return `no local agent on PATH (${all.map((spec) => spec.name).join(', ')}) — the platform builds; /pull afterwards`;
}

export function pickAdapter(ws: Pick<Workshop, 'adapters' | 'env'>, name?: string): AdapterSpec {
  if (name) {
    const spec =
      ws.adapters.find((row) => row.name === name) ??
      detectAdapter(name, (cmd) => whichOnPath(cmd, ws.env), loadAdapters(ws.env));
    if (!spec) throw new CliError(`adapter ${name} is not on PATH`, EXIT_INPUT, `install ${name}, or omit --agent`);
    return spec;
  }
  const spec = ws.adapters[0];
  if (!spec) {
    throw new CliError(
      'no local agent on PATH — run gamedevpl agents to see supported tools',
      EXIT_REFUSED,
      '/builder platform lets the platform build instead',
    );
  }
  return spec;
}

export async function chooseAdapter(
  ws: Pick<Workshop, 'adapters' | 'env' | 'pick' | 'unattended' | 'selectedAgent'>,
  name?: string,
): Promise<AdapterSpec> {
  const selected = ws.selectedAgent;
  delete ws.selectedAgent;
  if (!name && selected) return pickAdapter(ws, selected);
  if (name || ws.adapters.length < 2 || ws.unattended) return pickAdapter(ws, name);
  const chosen = await ws.pick(
    ws.adapters.map((spec) => spec.name),
    'Which agent?',
  );
  if (!ws.adapters.some((spec) => spec.name === chosen)) {
    throw new CliError('agent selection cancelled', EXIT_REFUSED, '/delegate when ready');
  }
  return pickAdapter(ws, chosen);
}
