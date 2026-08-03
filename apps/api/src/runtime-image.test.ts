import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The runtime image has to be able to bundle a game.
 *
 * This is a source guard rather than a unit test because the failure it catches
 * cannot be reproduced anywhere a test runs: every machine that runs this suite
 * has a full node_modules, so esbuild works here and only here. In the container
 * it did not, for months, and nothing noticed — published games are served from
 * the pre-baked snapshot, so the server never assembled one until the remix code
 * lane asked it to, and then every game on the site answered "this game cannot be
 * remixed that deeply yet".
 */

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const runtimeInstall = dockerfile
  .split('\n')
  .filter((line) => line.startsWith('RUN npm ci'))
  .at(-1)!;

describe('the API runtime image', () => {
  it('does not strip optional dependencies, which is where esbuild keeps its engine', () => {
    // esbuild ships per-platform binaries as optionalDependencies (@esbuild/linux-x64)
    // and its postinstall is the only fallback — so --omit=optional together with
    // --ignore-scripts leaves the JavaScript wrapper with nothing to execute.
    expect(runtimeInstall).not.toContain('--omit=optional');
  });

  it('keeps esbuild a real dependency of the API, not a build-time one', () => {
    // --omit=dev is correct and stays; that makes this the load-bearing half.
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.esbuild).toBeTruthy();
  });
});
