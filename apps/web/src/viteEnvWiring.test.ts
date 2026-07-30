import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `import.meta.env.VITE_*` is inlined by Vite at BUILD time. Nothing at runtime can supply
 * one: a value that reaches the Cloud Run service env and not the image build is simply
 * absent from the bundle, and `??`/falsy fallbacks turn that absence into a plausible wrong
 * answer rather than an error.
 *
 * That is not hypothetical. `VITE_MP_RELAY_URL` was threaded into the service env by both
 * deploy paths and into neither build, so it inlined empty, `socketUrlFrom` fell through to
 * the page origin, and every client dialled `/api/mp/ws` on the app — a route the app stops
 * serving the moment the relay is configured. Party mode was dead in production while every
 * server-side check passed, because every server-side check was, correctly, about the server.
 *
 * `protocol.test.ts` already pinned the precedence rule and even named this case ("ignores
 * empty strings, which is what an unset Vite var inlines to"). The rule was right; the value
 * never arrived. So the gap this file closes is not "is the logic correct" but "does the
 * value reach the bundle at all" — a wiring question, answered against the wiring.
 *
 * Deliberately static rather than a build-artifact grep: this runs in milliseconds on every
 * `npm test`, needs no Docker, and fails on the commit that introduces the gap rather than
 * on the deploy that reveals it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8');

const DOCKERFILE = 'apps/api/Dockerfile';
const CLOUDBUILD = 'infra/cloudbuild.yaml';
const WORKFLOW = '.github/workflows/deploy.yml';
const DEPLOY_SCRIPT = 'infra/deploy-api.sh';

/**
 * Vars that are intentionally NOT passed to the production build, each with the reason it is
 * safe. An entry here is a claim that empty is the correct production value — so adding one
 * should be as deliberate as adding the var. Anything not listed must be threaded end to end.
 */
const DELIBERATELY_EMPTY_IN_PRODUCTION: Record<string, string> = {
  VITE_API_BASE_URL:
    'The API is same-origin in production; this exists for local dev, where the API is a ' +
    'separate Fastify port. Empty is what makes the bundle call its own origin.',
};

/** Every `import.meta.env.VITE_*` the web source actually reads. */
function viteVarsUsedInSource(): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      // The test file itself names these vars while asserting about them.
      if (full.endsWith('viteEnvWiring.test.ts')) continue;
      for (const match of readFileSync(full, 'utf8').matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) {
        found.add(match[1]);
      }
    }
  };
  walk(path.join(repoRoot, 'apps', 'web', 'src'));
  return [...found].sort();
}

const usedVars = viteVarsUsedInSource();
const threadedVars = usedVars.filter((name) => !(name in DELIBERATELY_EMPTY_IN_PRODUCTION));

describe('VITE_* build wiring', () => {
  it('finds the vars the source actually reads', () => {
    // A guard on the guard: if the scan silently matched nothing, every assertion below
    // would pass vacuously — which is the same class of failure this file exists to catch.
    expect(usedVars.length).toBeGreaterThan(0);
    expect(threadedVars.length).toBeGreaterThan(0);
  });

  it.each(usedVars)('%s is declared as a build ARG and exported as ENV', (name) => {
    // ARG alone is not enough: without the matching ENV the value is visible to the
    // Dockerfile and not to the `vite build` process that inlines it.
    const dockerfile = read(DOCKERFILE);
    expect(dockerfile).toMatch(new RegExp(`^ARG ${name}=`, 'm'));
    expect(dockerfile).toMatch(new RegExp(`^ENV ${name}=\\$${name}$`, 'm'));
  });

  it.each(threadedVars)('%s is passed to docker build by cloudbuild.yaml', (name) => {
    const cloudbuild = read(CLOUDBUILD);
    const substitution = `_${name.replace(/^VITE_/, '')}`;
    expect(cloudbuild).toContain(`${name}=\${${substitution}}`);
    // Declared in `substitutions:` too, or Cloud Build rejects the build outright.
    expect(cloudbuild).toMatch(new RegExp(`^\\s*${substitution}:`, 'm'));
  });

  it.each(threadedVars)('%s is supplied by the CI deploy path', (name) => {
    const substitution = `_${name.replace(/^VITE_/, '')}`;
    expect(read(WORKFLOW)).toContain(`${substitution}=`);
  });

  it.each(threadedVars)('%s is supplied by the manual deploy path', (name) => {
    // Both paths, deliberately. They drifted apart once already, and a manual deploy that
    // silently drops a var produces an image indistinguishable from a good one until a user
    // touches the feature.
    const substitution = `_${name.replace(/^VITE_/, '')}`;
    expect(read(DEPLOY_SCRIPT)).toContain(`${substitution}=`);
  });

  it('states a reason for every var it excuses from the production build', () => {
    for (const [name, reason] of Object.entries(DELIBERATELY_EMPTY_IN_PRODUCTION)) {
      expect(usedVars, `${name} is excused but no longer used; drop the entry`).toContain(name);
      expect(reason.length, `${name} needs a real reason, not a placeholder`).toBeGreaterThan(40);
    }
  });
});

describe('the relay URL specifically', () => {
  // Called out by name because its absence is silent, its blast radius is the whole
  // multiplayer feature, and the fallback that hides it lives one function away.
  it('is threaded end to end', () => {
    expect(threadedVars).toContain('VITE_MP_RELAY_URL');
  });

  it('is read by the socket URL resolver', () => {
    const protocol = read('apps/web/src/mp/protocol.ts');
    expect(protocol).toContain('import.meta.env.VITE_MP_RELAY_URL');
  });

  it('is the first argument to socketUrlFrom, which is what makes it win', () => {
    // Precedence is the whole point: once the relay exists the app origin stops serving
    // /api/mp/ws, so a relay URL that loses to VITE_API_BASE_URL or the page origin is the
    // same outage as no relay URL at all.
    const protocol = read('apps/web/src/mp/protocol.ts').replace(/\s+/g, ' ');
    expect(protocol).toMatch(
      /socketUrlFrom\(\s*import\.meta\.env\.VITE_MP_RELAY_URL,\s*import\.meta\.env\.VITE_API_BASE_URL,/,
    );
  });
});
