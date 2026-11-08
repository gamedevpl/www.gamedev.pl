import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { EXIT_INPUT } from './exit-codes.js';

type PluginRow = {
  target: string;
  status: string;
  changed?: boolean;
  installedVersion?: string;
  skipped?: string;
  error?: string;
};
export type PluginRefresh = { ok: boolean; updated: boolean; plugins: PluginRow[]; error?: string };
const PRESERVED = new Set(['modified', 'pending', 'disabled', 'removed']);

export async function refreshInstalledPlugins(input: {
  dest: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  stderr?: { write(value: string): unknown };
}): Promise<PluginRefresh> {
  try {
    const { code, output } = await new Promise<{ code: number | null; output: string }>((done, reject) => {
      const child = spawn(process.execPath, [resolve(input.dest), 'plugins', 'update', '--json'], {
        cwd: input.cwd,
        env: input.env,
        stdio: ['inherit', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (output.length > 1_000_000) {
          child.kill();
          reject(new Error('Plugin update output exceeded its limit'));
        }
      });
      child.stderr.on('data', (chunk: Buffer) => input.stderr?.write(chunk.toString()));
      child.once('error', reject);
      child.once('close', (code) => done({ code, output }));
    });
    const result = JSON.parse(output) as { ok?: unknown; plugins?: unknown };
    if (
      typeof result?.ok !== 'boolean' ||
      !Array.isArray(result.plugins) ||
      result.plugins.some((row: PluginRow) => !row || typeof row.target !== 'string' || typeof row.status !== 'string')
    )
      throw new Error('Plugin update returned an invalid report');
    const plugins = result.plugins as PluginRow[];
    const preserved = (row: PluginRow) => row.changed === false && PRESERVED.has(row.skipped ?? '');
    const failed = plugins.some((row) => row.error && !preserved(row));
    if (
      (code !== 0 && code !== EXIT_INPUT) ||
      (!result.ok && !plugins.some((row) => row.error)) ||
      (code !== 0 && result.ok)
    )
      throw new Error('Plugin update process did not complete normally');
    return { ok: !failed, updated: plugins.some((row) => row.changed === true), plugins };
  } catch {
    return {
      ok: false,
      updated: false,
      plugins: [],
      error: 'CLI installed; automatic plugin update failed. Retry gamedevpl plugins update.',
    };
  }
}

export function formatPluginRefresh(result: PluginRefresh): string {
  if (result.error) return result.error;
  const lines = result.plugins
    .filter((row) => row.status !== 'absent' || row.error)
    .map((row) => {
      const version = row.installedVersion ? ` (${row.installedVersion})` : '';
      if (row.skipped && row.skipped !== 'current') return `${row.target}: skipped (${row.skipped})`;
      if (row.error) return `${row.target}: update failed — ${row.error}`;
      return `${row.target}: ${row.changed ? 'updated' : 'up to date'}${version}`;
    });
  const summary = lines.length
    ? `Coding-agent plugins:\n${lines.join('\n')}`
    : 'No coding-agent plugins need updating.';
  return summary + (result.ok ? '' : '\nCLI updated. Retry failed plugins with gamedevpl plugins update.');
}
