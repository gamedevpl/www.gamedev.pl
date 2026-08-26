import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * `REMIX_DEBUG` puts the player's own words in the response and the log.
 *
 * It is on by owner decision while one question is open — how often does the
 * code lane land, and why does it miss. What these pin is not whether it is on,
 * which is the owner's call, but that the two directions work the way the
 * comments claim, because the first version of this claimed something false:
 * that clearing the repository variable closed the window. It does not. A
 * revision already running keeps the value it was deployed with.
 *
 * So opening is deploy-threaded — through *both* supported paths, or a deploy
 * from the script would silently drop what the workflow set — and closing lives
 * at runtime on the breaker document, where it takes effect within the TTL.
 */

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');

describe('the remix debug flag', () => {
  it('is threaded by both deploy paths, so neither drops what the other set', () => {
    // The workflow reads repo variables as step env, not as ${{ }} inside the run body:
    // a run: body carrying expressions is compiled as one, and this step's blew past the
    // 21,000-character expression ceiling, which failed every deploy before it started.
    expect(workflow).toContain('REMIX_DEBUG: ${{ vars.REMIX_DEBUG }}');
    expect(workflow).toContain('REMIX_DEBUG_VAL="${REMIX_DEBUG}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|REMIX_DEBUG=${REMIX_DEBUG_VAL}"');
    expect(script).toContain('ENV_VARS="${ENV_VARS}|REMIX_DEBUG=${REMIX_DEBUG}"');
  });

  it('is never pinned on in either path', () => {
    // A literal would survive every attempt to turn it off from the settings
    // page, which is the only place anyone will think to look.
    expect(workflow).not.toMatch(/REMIX_DEBUG=(true|"true")/);
    expect(script).not.toMatch(/REMIX_DEBUG=(true|"true")/);
  });
});
