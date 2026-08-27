import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// REMIX_DEBUG puts the player's words in the response and log.

// These pin the two directions, not whether the flag is on.

// Clearing the variable does not close it: a revision keeps its value.

// Opening is deploy-threaded both paths; closing lives on the breaker.

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');

describe('the remix debug flag', () => {
  it('is threaded by both deploy paths, so neither drops what the other set', () => {
    // Read as step env; expressions in a run body share one 21k ceiling.
    expect(workflow).toContain('REMIX_DEBUG: ${{ vars.REMIX_DEBUG }}');
    expect(workflow).toContain('REMIX_DEBUG_VAL="${REMIX_DEBUG}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|REMIX_DEBUG=${REMIX_DEBUG_VAL}"');
    expect(script).toContain('ENV_VARS="${ENV_VARS}|REMIX_DEBUG=${REMIX_DEBUG}"');
  });

  it('is never pinned on in either path', () => {
    // A literal survives any attempt to turn it off in settings.
    expect(workflow).not.toMatch(/REMIX_DEBUG=(true|"true")/);
    expect(script).not.toMatch(/REMIX_DEBUG=(true|"true")/);
  });
});
