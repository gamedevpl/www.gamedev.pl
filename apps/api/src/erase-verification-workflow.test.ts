import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The nightly erasure proof runs as its own credential, and must keep doing so.
 *
 * `verify:erase` needs Firestore write access, which the deploy account deliberately does
 * not have. The tempting repair when the nightly job fails on authentication is to grant
 * `roles/datastore.user` to `github-actions-deployer` and point the workflow at it — one
 * line in each file, and the job goes green. What it also does is give every deploy the
 * ability to read every player's row, permanently and invisibly, in service of a
 * verification job that was supposed to be about protecting exactly that data.
 *
 * Firestore IAM cannot scope a role to collections, so the separation between the two
 * accounts is the only boundary there is. It is a property of two text files agreeing,
 * which is precisely the kind that erodes without a test — same reasoning as
 * firestore-indexes.test.ts, and the same shape of guard: a lint over source text that
 * also asserts it found what it expected, because a guard silently matching nothing reads
 * as coverage while providing none.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const workflow = readFileSync(resolve(repoRoot, '.github/workflows/verify-erase.yml'), 'utf8');
const setupWif = readFileSync(resolve(repoRoot, 'infra/setup-wif.sh'), 'utf8');

const DEPLOYER_SA = 'github-actions-deployer@gamedevpl.iam.gserviceaccount.com';
const VERIFIER_SA = 'erase-verifier@gamedevpl.iam.gserviceaccount.com';

describe('verify-erase workflow', () => {
  it('runs the verification command on a schedule', () => {
    // Without the schedule this is a command nobody runs, which is the state it was built
    // to end: erasure was last proven whenever somebody last thought to check.
    expect(workflow).toMatch(/^\s*schedule:$/m);
    expect(workflow).toMatch(/cron:/);
    expect(workflow).toContain('npm run verify:erase -w @gamedevpl/api');
  });

  it('names the project in a variable the Firestore client reads', () => {
    // `new Firestore()` is constructed with no project argument, so google-auth resolves
    // one from GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT, the credential file, or the metadata
    // server. A runner has no metadata server and the WIF credential carries no project,
    // so anything else — a plausible-looking PROJECT_ID, say — leaves the job failing with
    // "Unable to detect a Project Id" after it has already authenticated, which reads as a
    // broken credential rather than a misnamed variable.
    expect(workflow).toMatch(/^\s*(GCLOUD_PROJECT|GOOGLE_CLOUD_PROJECT): 'gamedevpl'$/m);
  });

  it('authenticates as the verifier account, never the deployer', () => {
    expect(workflow).toContain(VERIFIER_SA);
    expect(workflow.replace(/^\s*#.*$/gm, '')).not.toContain(DEPLOYER_SA);
  });

  it('asks for no more GitHub permission than it needs', () => {
    // `id-token: write` is what mints the WIF assertion; `contents: read` checks the repo
    // out. Anything beyond that is a workflow that can change the thing it is auditing.
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*id-token: write/);
  });

  it('builds workspace packages before running the tsx script', () => {
    // Nightly died on missing contract dist
    const body = workflow.replace(/^\s*#.*$/gm, '');
    expect(body).toMatch(/npm ci[\s\S]*npm run build:packages[\s\S]*npm run verify:erase/);
  });
});

describe('setup-wif.sh', () => {
  it('creates the verifier account and gives it Firestore access', () => {
    expect(setupWif).toContain('erase-verifier');
    expect(setupWif).toContain('roles/datastore.user');
    // The binding, without which the workflow can authenticate as nobody.
    expect(setupWif).toMatch(/add-iam-policy-binding "\$VERIFIER_SA_EMAIL"/);
  });

  it('keeps every Firestore role off the deploy account', () => {
    // The whole point of two accounts. Asserted against the deployer's role list rather
    // than the file as a whole, since the verifier's grant is in the same file.
    const deployerRoles = setupWif.match(/^for ROLE in .*$/m)?.[0];
    expect(deployerRoles).toBeDefined();
    expect(deployerRoles).not.toMatch(/datastore|firestore/i);
  });
});
