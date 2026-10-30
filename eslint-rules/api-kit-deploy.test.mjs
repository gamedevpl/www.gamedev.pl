import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const sentinel = 'PRIVATE_ENGINE_SOURCE_SENTINEL';

function runStep(name, fails) {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  const script = step?.split('        run: |\n')[1]?.replace(/^ {10}/gm, '');
  expect(script).toBeTruthy();
  const dir = mkdtempSync(path.join(tmpdir(), 'api-kit-deploy-test-'));
  try {
    writeFileSync(path.join(dir, 'node'), `#!/bin/sh\necho ${sentinel}\nexit ${fails ? 1 : 0}\n`, { mode: 0o755 });
    writeFileSync(path.join(dir, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(path.join(dir, 'gcloud'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$RUNNER_TEMP/traffic"\n', {
      mode: 0o755,
    });
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        RUNNER_TEMP: dir,
        DEPLOY_SHA: 'a'.repeat(40),
        CANDIDATE_URL: 'https://candidate.run.app',
        CANDIDATE_REVISION: 'gamedev-app-tested',
        KIT_COMPAT_RECEIPT: path.join(dir, 'receipt'),
        SERVICE: 'gamedev-app',
        REGION: 'test',
        PROJECT_ID: 'test',
      },
    });
    let traffic = '';
    try {
      traffic = readFileSync(path.join(dir, 'traffic'), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return { ...result, traffic };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('API compatibility deployment boundary', () => {
  it.each(['Verify candidate API with every supported published Kit', 'Promote candidate revision to 100% traffic'])(
    'blocks %s without leaking failed private compiler output',
    (name) => {
      const result = runStep(name, true);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(sentinel);
      expect(result.stdout).toContain('traffic retained');
      expect(result.traffic).toBe('');
    },
  );
  it('promotes only the identified revision after a successful recheck', () => {
    const result = runStep('Promote candidate revision to 100% traffic', false);
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(sentinel);
    expect(result.traffic).toContain('--to-revisions gamedev-app-tested=100');
    expect(result.traffic).not.toContain('--to-latest');
  });
});
