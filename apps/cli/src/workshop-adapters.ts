import { detectAdapter, loadAdapters, whichOnPath, type AdapterSpec } from './adapters.js';

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
