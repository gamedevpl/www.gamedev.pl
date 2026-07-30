import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The party relay's instance pin, as a property of three files agreeing.
 *
 * `--max-instances 1` on the app service is not a performance choice, it is a correctness
 * one: a party room lives in one process's memory (`mp.ts`), so a guest load-balanced to a
 * second container cannot see the host's room. The failure is intermittent, arrives as
 * "the QR code doesn't work", and gets blamed on the guest's wifi — which is why it must
 * not be possible to lift the pin as a standalone act of tuning.
 *
 * The design that makes it safe is that the ceiling is *derived* from `MP_RELAY_URL`: the
 * same variable that moves room creation to the relay service is the one that raises the
 * ceiling, so the two can never be half-done. That is exactly the kind of coupling that
 * erodes — someone raises a ceiling to fix a load problem, party mode breaks two weeks
 * later, and nothing connects the two events. So it is asserted here, in the same shape as
 * `firestore-indexes.test.ts` and `erase-verification-workflow.test.ts`: a lint over source
 * text that also checks it matched something, because a guard that silently matches nothing
 * reads as coverage while providing none.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const deployApi = readFileSync(resolve(repoRoot, 'infra/deploy-api.sh'), 'utf8');
const deployRelay = readFileSync(resolve(repoRoot, 'infra/deploy-relay.sh'), 'utf8');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/deploy.yml'), 'utf8');

/**
 * Ordering assertions are index arithmetic, not multi-line regexes, on purpose.
 *
 * The regex this replaced — `else\s*\n\s*(?:.*\n\s*)*?MAX_INSTANCES=1` — was flagged by
 * CodeQL for exponential backtracking, correctly: `\s` matches `\n`, so it overlaps the
 * group that follows and a run of blank lines explodes the search. These assertions are
 * really about *order* (guard, then raise, then else, then pin), and order is `indexOf`.
 */
const positions = (source: string, guard: string) => {
  const guardAt = source.indexOf(guard);
  const elseAt = source.indexOf('else', guardAt);
  return {
    guardAt,
    raiseAt: source.indexOf('MAX_INSTANCES=', guardAt),
    elseAt,
    pinAt: source.indexOf('MAX_INSTANCES=1', elseAt),
  };
};

describe('app service instance ceiling', () => {
  const GUARDED = [
    [deployApi, 'if [ -n "$MP_RELAY_URL" ]; then'],
    [workflow, 'if [ -n "$MP_RELAY_URL_VAL" ]; then'],
  ] as const;

  it('is a variable in both deploy paths, not a literal', () => {
    // A literal `--max-instances 1` is not wrong today, but it is the form that gets edited
    // to `--max-instances 10` by someone reading a cold-start graph. Forcing it through a
    // variable means the only place to change it is the block that explains what it costs.
    expect(deployApi).toContain('--max-instances "$MAX_INSTANCES"');
    expect(workflow).toContain('--max-instances "$MAX_INSTANCES"');
    expect(deployApi).not.toMatch(/--max-instances\s+1\b/);
    expect(workflow).not.toMatch(/--max-instances\s+1\b/);
  });

  it('is pinned to one instance whenever the relay is not split out', () => {
    // The `else` branch is the whole guard: unset relay URL means rooms are still local,
    // and there is exactly one safe ceiling for that.
    for (const [source, guard] of GUARDED) {
      const { elseAt, pinAt } = positions(source, guard);
      expect(elseAt).toBeGreaterThan(-1);
      expect(pinAt).toBeGreaterThan(elseAt);
    }
  });

  it('only raises the ceiling inside a MP_RELAY_URL guard', () => {
    // Both files must decide the ceiling from the relay variable and nothing else. Checking
    // that the raise sits between the guard and its `else` is what stops the two drifting
    // apart into "raised, and separately, hopefully, forwarded".
    for (const [source, guard] of GUARDED) {
      const { guardAt, raiseAt, elseAt } = positions(source, guard);
      expect(guardAt).toBeGreaterThan(-1);
      expect(raiseAt).toBeGreaterThan(guardAt);
      expect(raiseAt).toBeLessThan(elseAt);
    }
    // ...and the raise is a real number, not an accidental empty assignment.
    expect(deployApi).toContain('MAX_INSTANCES="${MAX_INSTANCES:-4}"');
    expect(workflow).toContain('MAX_INSTANCES=4');
  });

  it('refuses a hand-set MAX_INSTANCES while rooms are still local', () => {
    // Ignoring the override silently would be worse than honouring it: the operator would
    // believe the service scales and only learn otherwise from a cost graph. Say so.
    expect(deployApi).toContain('Ignoring MAX_INSTANCES=');
  });
});

describe('MP_RELAY_URL wiring', () => {
  it('is passed on every deploy rather than set on the service by hand', () => {
    // --set-env-vars replaces the whole map. A value set once in the console survives until
    // the next deploy wipes it, at which point room creation quietly comes back in-process
    // while the raised ceiling stays — the one combination that is broken by construction.
    expect(deployApi).toContain('ENV_VARS="${ENV_VARS}|MP_RELAY_URL=${MP_RELAY_URL}"');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|MP_RELAY_URL=${MP_RELAY_URL_VAL}"');
  });

  it('comes from a repo variable in CI, not a secret or a literal', () => {
    // A service URL is not a secret, and putting it in one would hide the single most
    // load-bearing piece of party-mode configuration from everyone reading the workflow.
    expect(workflow).toContain('vars.MP_RELAY_URL');
    expect(workflow).not.toContain('secrets.MP_RELAY_URL');
  });
});

describe('infra/deploy-relay.sh', () => {
  it('deploys the relay role, pinned, from the app service’s own image', () => {
    // One image, both roles: the relay follows whatever the app is running. If this ever
    // grows its own build, the two can drift, and drift between the workspace layout and an
    // image is what took every deploy down when @gamedevpl/zone-core landed.
    expect(deployRelay).toContain('MP_RELAY_ONLY=1');
    expect(deployRelay).toContain("--format 'value(spec.template.spec.containers[0].image)'");
    expect(deployRelay).toContain('--max-instances "$MAX_INSTANCES"');
    expect(deployRelay).toMatch(/MAX_INSTANCES="\$\{MAX_INSTANCES:-1\}"/);
  });

  it('declares the env separator before using it', () => {
    // gcloud splits --set-env-vars on commas unless the value opens with `^|^`. Omitting the
    // prefix while using `|` does not fail: it deploys ONE variable called MP_RELAY_ONLY
    // whose value contains the other two. That is not a broken relay, it is a worse thing —
    // MP_RELAY_ONLY no longer equals "1" so the service comes up in *app* mode, and
    // PRIVATE_BETA is unset so the beta wall is off, leaving a fully public unwalled copy of
    // the site on a run.app URL. This was the actual first draft of the script.
    const setEnv = deployRelay.match(/--set-env-vars "([^"]*)"/)?.[1];
    expect(setEnv).toBeDefined();
    if (setEnv?.includes('|')) {
      expect(setEnv.startsWith('^|^')).toBe(true);
    }
    // The same trap, same fix, in the file this one was modelled on.
    expect(deployApi).toContain('ENV_VARS="^|^');
  });

  it('reads the deployed env back before declaring success', () => {
    // The separator bug is invisible from outside: the service is healthy, and the symptom
    // is a create-route probe failing with a 404 that reads like an auth problem while the
    // real fault is an unwalled site. Asserting the three names exist as three separate
    // variables is the check that names it directly.
    expect(deployRelay).toContain('--format=json');
    expect(deployRelay).toMatch(/for VAR in MP_RELAY_ONLY PRIVATE_BETA MP_RELAY_CALLER_SA/);
    // And it must tell the operator to take the service down, not just report a variable.
    expect(deployRelay).toContain('gcloud run services delete');
  });

  it('configures both halves of the internal-auth verifier', () => {
    // Either one missing makes the create route deny-all (internal-auth.ts) — the relay
    // comes up healthy and every lobby fails. Fails closed, which is right, but it must not
    // be the state a successful run leaves behind.
    expect(deployRelay).toContain('MP_RELAY_CALLER_SA=');
    expect(deployRelay).toContain('MP_RELAY_AUDIENCE=');
  });

  it('refuses to deploy the relay role over the app service', () => {
    // Same image, different env: one wrong SERVICE= and the site stops serving the web
    // bundle and answers only a websocket. Worth a guard rather than a warning.
    expect(deployRelay).toMatch(/if \[ "\$SERVICE" = "\$APP_SERVICE" \]/);
  });

  it('proves an unauthenticated create is refused before declaring success', () => {
    // The relay must be publicly reachable (a phone that scanned a QR has no identity), so
    // "reachable" tells you nothing. What matters is that the route which *creates* rooms
    // refuses a caller with no token, and that is checkable in one curl.
    expect(deployRelay).toContain('/api/internal/mp/sessions');
    expect(deployRelay).toMatch(/401 \| 403/);
  });

  it('mounts only the secret it needs', () => {
    // Room tokens are HMAC'd from SESSION_SECRET. The relay reads no games, files no
    // submissions and terminates no sessions, so anything else mounted here is blast radius
    // bought for nothing.
    expect(deployRelay).toContain('SESSION_SECRET=session-secret:latest');
    expect(deployRelay).not.toContain('GITHUB_TOKEN=');
    expect(deployRelay).not.toContain('SUBMISSION_TOKEN_SECRET=');
  });
});

describe('deploy workflow relay step', () => {
  it('moves the relay onto the new image before promoting the app', () => {
    // Server before client: the freshly promoted bundle is the relay's client, so the relay
    // has to speak the new protocol first. Asserted by position, because the ordering is the
    // entire point and a later refactor would not obviously break anything else.
    const relayStep = workflow.indexOf('Move the party relay onto the same image');
    const promoteStep = workflow.indexOf('Promote candidate revision to 100% traffic');
    expect(relayStep).toBeGreaterThan(-1);
    expect(promoteStep).toBeGreaterThan(-1);
    expect(relayStep).toBeLessThan(promoteStep);
  });

  it('updates only the image, leaving the relay’s own configuration alone', () => {
    // `gcloud run services update --image` is additive. A `run deploy` here would need the
    // full env map repeated, and the day someone forgot one line the relay would come back
    // as a second copy of the app with an open create route.
    expect(workflow).toContain('gcloud run services update "$RELAY_SERVICE"');
    expect(workflow).not.toMatch(/RELAY_SERVICE"[\s\S]{0,400}--set-env-vars/);
  });

  it('fails the deploy when the configured URL and the real one disagree', () => {
    // The OIDC audience is the callee's URL. A mismatch is an auth failure on every lobby,
    // visible only to a host trying to open one.
    expect(workflow).toContain('The OIDC audience would not match');
  });
});
