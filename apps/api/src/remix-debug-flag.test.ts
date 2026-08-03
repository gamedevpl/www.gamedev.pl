import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * `REMIX_DEBUG` puts the player's own words in the response and the log.
 *
 * It is on by owner decision while one question is open — how often does the
 * code lane land, and why does it miss — and it is meant to close again after.
 * What this pins is not whether it is on, which is the owner's call, but that
 * the switch stays where a decision can be seen and reversed: threaded from a
 * repository variable through the deploy, never a literal in the workflow and
 * never typed onto the Cloud Run service, where `--set-env-vars` would wipe it
 * on the next deploy and the trace would go quiet with nothing to explain it.
 */

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');

describe('the remix debug flag', () => {
  it('is threaded from a repository variable, so turning it off needs no deploy', () => {
    expect(workflow).toContain('REMIX_DEBUG_VAL="${{ vars.REMIX_DEBUG }}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|REMIX_DEBUG=${REMIX_DEBUG_VAL}"');
  });

  it('is never pinned on in the workflow itself', () => {
    // A literal would survive every attempt to turn it off from the settings
    // page, which is the only place anyone will think to look.
    expect(workflow).not.toMatch(/REMIX_DEBUG=(true|"true")/);
  });
});
