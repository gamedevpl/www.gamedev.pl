import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');

describe('the CLI_SURFACE flag', () => {
  it('is threaded by both deploy paths, so neither drops what the other set', () => {
    expect(workflow).toContain('CLI_SURFACE: ${{ vars.CLI_SURFACE }}');
    expect(workflow).toContain('CLI_SURFACE_VAL="${CLI_SURFACE}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|CLI_SURFACE=${CLI_SURFACE_VAL}"');
    expect(script).toMatch(/for FLAG_VAR in [^;]*\bCLI_SURFACE\b/);
  });

  it('is never pinned on in either path', () => {
    const code = (source: string) =>
      source
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n');
    const pinned = /CLI_SURFACE=("?)(true|1)\1/i;
    expect(code(workflow)).not.toMatch(pinned);
    expect(code(script)).not.toMatch(pinned);
  });
});
