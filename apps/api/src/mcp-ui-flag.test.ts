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
    expect(workflow).toContain('MCP_UI_VAL="${{ vars.MCP_UI }}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|MCP_UI=${MCP_UI_VAL}"');
    // The script threads it through the shared flag loop rather than its own block.
    expect(script).toMatch(/for FLAG_VAR in [^;]*\bMCP_UI\b/);
  });

  it('is never pinned on in either path', () => {
    // A literal would survive every attempt to turn it off from the settings page,
    // which is the only place anyone will think to look.
    expect(workflow).not.toMatch(/MCP_UI=(true|"true")/);
    expect(script).not.toMatch(/MCP_UI=(true|"true")/);
  });
});
