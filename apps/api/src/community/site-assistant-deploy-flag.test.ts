import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// SITE_ASSISTANT gates the mascot's server model in both deploy paths.

const workflow = readFileSync(new URL('../../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../../infra/deploy-api.sh', import.meta.url), 'utf8');

describe('the site assistant flag', () => {
  it('is threaded by both deploy paths, so neither drops what the other set', () => {
    for (const name of ['SITE_ASSISTANT', 'SITE_ASSISTANT_MODEL']) {
      // Read as step env; expressions in a run body share one ceiling.
      expect(workflow).toContain(`${name}: \${{ vars.${name} }}`);
      expect(workflow).toContain(`ENV_VARS="\${ENV_VARS}|${name}=`);
      expect(script).toMatch(new RegExp(`for FLAG_VAR in [^;]*\\b${name}\\b`));
    }
  });

  it('is never pinned on in either path', () => {
    const code = (source: string) =>
      source
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n');
    const pinned = /SITE_ASSISTANT=("?)(true|1)\1/i;
    expect(code(workflow)).not.toMatch(pinned);
    expect(code(script)).not.toMatch(pinned);
  });
});
