import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// MCP_UI opens MCP Apps views on the MCP route.

// Setting env vars replaces the whole map; one path drops the other.

// That once cost a hand-set flag, and its leak returned unseen.

// Views lost this way fail silently, in a client we cannot see.

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');

describe('the MCP Apps views flag', () => {
  it('is threaded by both deploy paths, so neither drops what the other set', () => {
    // Read as step env; expressions in a run body share one 21k ceiling.
    expect(workflow).toContain('MCP_UI: ${{ vars.MCP_UI }}');
    expect(workflow).toContain('MCP_UI_VAL="${MCP_UI}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|MCP_UI=${MCP_UI_VAL}"');
    // The script threads it through the shared loop, not its own block.
    expect(script).toMatch(/for FLAG_VAR in [^;]*\bMCP_UI\b/);
  });

  it('is never pinned on in either path', () => {
    // A literal survives any attempt to turn it off in settings.

    // Both spellings count as a pin; comments are stripped first.

    // Matching stays unanchored: a pin sits mid-string in the env list.
    const code = (source: string) =>
      source
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n');
    const pinned = /MCP_UI=("?)(true|1)\1/i;
    expect(code(workflow)).not.toMatch(pinned);
    expect(code(script)).not.toMatch(pinned);
  });
});
