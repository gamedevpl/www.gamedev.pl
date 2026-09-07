import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Relay trusts what gamedev-app runs as, plus the account it leaves.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const deployApi = readFileSync(resolve(repoRoot, 'infra/deploy-api.sh'), 'utf8');
const deployRelay = readFileSync(resolve(repoRoot, 'infra/deploy-relay.sh'), 'utf8');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/deploy.yml'), 'utf8');

describe('runtime identities', () => {
  it('pins the relay’s identity and the caller it trusts on every update', () => {
    expect(workflow).toContain('--service-account "$RELAY_RUNTIME_SA"');
    expect(workflow).toContain('CALLER_SAS="$APP_RUNTIME_SA"');
    expect(workflow).toContain('--update-env-vars "^|^MP_RELAY_CALLER_SA=${CALLER_SAS}"');
    expect(deployRelay).toContain('--service-account "$RUNTIME_SA"');
  });

  // Reversed, an identity change 401s its own gate and wedges every deploy.
  it('updates the relay before the gate that opens a lobby through it', () => {
    const relayStep = workflow.indexOf('- name: Move the party relay onto the same image');
    const gateStep = workflow.indexOf('- name: Browser gate against the candidate');
    expect(relayStep).toBeGreaterThan(-1);
    expect(gateStep).toBeGreaterThan(relayStep);
  });

  it('refuses a relay caller on the default compute account', () => {
    expect(deployRelay).toMatch(/\[\[ "\$CALLER_SA" == \*-compute@developer\.gserviceaccount\.com \]\]/);
  });

  it('derives the seed-dispatch caller from the runtime identity in both paths', () => {
    expect(workflow).toContain('SEED_DISPATCH_SA="$APP_RUNTIME_SA"');
    expect(workflow).not.toContain('vars.SEED_DISPATCH_SA');
    expect(deployApi).toContain('SEED_DISPATCH_SA="${SEED_DISPATCH_SA:-${RUNTIME_SA}}"');
  });
});
