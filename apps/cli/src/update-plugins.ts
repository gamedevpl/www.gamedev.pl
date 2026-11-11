import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { EXIT_INPUT } from './exit-codes.js';

import { formatPluginRow, type PluginReportRow } from './plugin-output.js';

export type PluginRefresh = { ok: boolean; updated: boolean; plugins: PluginReportRow[]; error?: string };
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
      result.plugins.some(
        (row: PluginReportRow) => !row || typeof row.target !== 'string' || typeof row.status !== 'string',
      )
    )
      throw new Error('Plugin update returned an invalid report');
    const plugins = result.plugins as PluginReportRow[];
    const preserved = (row: PluginReportRow) => row.changed === false && PRESERVED.has(row.skipped ?? '');
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
    .map((row) => formatPluginRow(row, 'update'));
  const summary = lines.length
    ? `Gamedev.pl integrations (local installation check; connection not tested):\n${lines.join('\n')}`
    : 'No Gamedev.pl plugins or MCP configuration detected. Plugins are optional; install only for clients you use. See choices: gamedevpl plugins status.';
  return summary + (result.ok ? '' : '\nCLI updated. Retry failed plugins with gamedevpl plugins update.');
}
