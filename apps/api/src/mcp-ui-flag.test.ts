import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * `MCP_UI` opens MCP Apps views (SEP-1865) on `/api/mcp`.
 *
 * Same threading rule as every other feature flag here, for the reason the deploy
 * script records in its own comments: `--set-env-vars` replaces the whole env map, so a
 * value set by hand on the service — or threaded by only one of the two supported deploy
 * paths — is dropped by the next deploy from the other one, silently. On 2026-08-04 that
 * cost a hand-set `TRANSLATE_BUILD_LOG=false`, and the spend leak it had fixed resumed
 * unnoticed.
 *
 * Views are a poor thing to lose that way: the flag turns off between one deploy and the
 * next, and the only symptom is a card that used to render and now does not, in someone
 * else's client, where we cannot see it.
 */

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');

describe('the MCP Apps views flag', () => {
  it('is threaded by both deploy paths, so neither drops what the other set', () => {
    // The workflow reads repo variables as step env, not as ${{ }} inside the run body:
    // a run: body carrying expressions is compiled as one, and this step's blew past the
    // 21,000-character expression ceiling, which failed every deploy before it started.
    expect(workflow).toContain('MCP_UI: ${{ vars.MCP_UI }}');
    expect(workflow).toContain('MCP_UI_VAL="${MCP_UI}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|MCP_UI=${MCP_UI_VAL}"');
    // The script threads it through the shared flag loop rather than its own block.
    expect(script).toMatch(/for FLAG_VAR in [^;]*\bMCP_UI\b/);
  });

  it('is never pinned on in either path', () => {
    // A literal would survive every attempt to turn it off from the settings page,
    // which is the only place anyone will think to look. Both spellings the parser
    // accepts count as a pin, not just "true".
    //
    // Comments are stripped first: a pin is code, and the env-header docs legitimately
    // name the values that switch views on. Matching unanchored matters — in the
    // workflow a pin would sit mid-string inside the ENV_VARS list, not at line end.
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
