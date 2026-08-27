import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// TAB_COMPLETE gates TA-01 — same threading rule as every other flag.

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');

describe('the tab-complete flag', () => {
  it('is threaded by both deploy paths, so neither drops what the other set', () => {
    // The workflow reads repo variables as step env, not as ${{ }} inside the run body:
    // a run: body carrying expressions is compiled as one, and this step's blew past the
    // 21,000-character expression ceiling, which failed every deploy before it started.
    expect(workflow).toContain('TAB_COMPLETE: ${{ vars.TAB_COMPLETE }}');
    expect(workflow).toContain('TAB_COMPLETE_VAL="${TAB_COMPLETE}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|TAB_COMPLETE=${TAB_COMPLETE_VAL}"');
    expect(script).toMatch(/for FLAG_VAR in [^;]*\bTAB_COMPLETE\b/);
  });

  it('is never pinned on in either path', () => {
    const code = (source: string) =>
      source
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n');
    const pinned = /TAB_COMPLETE=("?)(true|1)\1/i;
    expect(code(workflow)).not.toMatch(pinned);
    expect(code(script)).not.toMatch(pinned);
  });
});
