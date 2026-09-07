import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The relay trusts one caller: whatever gamedev-app runs as.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const deployApi = readFileSync(resolve(repoRoot, 'infra/deploy-api.sh'), 'utf8');
const deployRelay = readFileSync(resolve(repoRoot, 'infra/deploy-relay.sh'), 'utf8');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/deploy.yml'), 'utf8');

describe('runtime identities', () => {
  it('pins the relay’s identity and the caller it trusts on every update', () => {
    expect(workflow).toContain('--service-account "$RELAY_RUNTIME_SA"');
    expect(workflow).toContain('--update-env-vars "MP_RELAY_CALLER_SA=${APP_RUNTIME_SA}"');
    expect(deployRelay).toContain('--service-account "$RUNTIME_SA"');
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
