import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadAdapters, preflightAdapter } from './adapters.js';
import { configureAdapter } from './agent-settings.js';
import { discoverAgents, formatAgents } from './agents.js';

it('preflights run flags and places the requested model after the OpenCode subcommand', () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-opencode-'));
  try {
    const command = join(root, 'opencode');
    writeFileSync(
      command,
      `#!${process.execPath}
if (process.argv[2] !== 'run' || !process.argv.includes('--help')) process.exit(1);
console.log('--format --model');
`,
      { mode: 0o700 },
    );
    const base = loadAdapters({ HOME: root }).adapters.find((row) => row.name === 'opencode')!;
    const spec = configureAdapter({ ...base, command }, { HOME: root }, { model: 'provider/model' });
    expect(spec.headless).toEqual(['run', '--model', 'provider/model', '--format', 'json']);
    expect(() => preflightAdapter(spec, {})).not.toThrow();
    expect(spec.headless).not.toContain('--auto');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('keeps editor launchers out of delegation and explains manual MCP setup', () => {
  const agents = discoverAgents({ HOME: '/tmp/gdpl-no-settings' }, (name) =>
    ['windsurf', 'cursor'].includes(name) ? '/bin/' + name : null,
  );
  const editor = agents.find((row) => row.name === 'windsurf-editor')!;
  expect(editor).toMatchObject({ installed: true, local: false, mcp: false });
  expect(agents.find((row) => row.name === 'cursor')?.installed).toBe(false);
  expect(formatAgents(agents)).toContain('windsurf-editor: found — editor; manual MCP setup');
});
