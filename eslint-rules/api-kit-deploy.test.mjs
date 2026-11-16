import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const sentinel = 'PRIVATE_ENGINE_SOURCE_SENTINEL';

function runStep(name, fails, nodeScript) {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  const script = step?.split('        run: |\n')[1]?.replace(/^ {10}/gm, '');
  expect(script).toBeTruthy();
  const dir = mkdtempSync(path.join(tmpdir(), 'api-kit-deploy-test-'));
  try {
    const scriptBody = nodeScript ?? `#!/bin/sh\necho ${sentinel}\nexit ${fails ? 1 : 0}\n`;
    writeFileSync(path.join(dir, 'node'), scriptBody, { mode: 0o755 });
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
    let nodeCalls = '';
    try {
      nodeCalls = readFileSync(path.join(dir, 'node-calls'), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return { ...result, traffic, nodeCalls };
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
  it('re-verifies and promotes when supported Kits change before promotion', () => {
    const nodeScript = `#!/bin/sh
echo "$*" >> "$RUNNER_TEMP/node-calls"
count=$(wc -l < "$RUNNER_TEMP/node-calls" | tr -d ' ')
if [ "$count" = "1" ]; then
  echo "Error: Supported Kits changed during API verification; retry deployment"
  exit 1
fi
exit 0
`;
    const result = runStep('Promote candidate revision to 100% traffic', false, nodeScript);
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(sentinel);
    expect(result.traffic).toContain('--to-revisions gamedev-app-tested=100');
    const calls = result.nodeCalls.trim().split('\n');
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain('--recheck');
    expect(calls[1]).not.toContain('--recheck');
    expect(calls[2]).toContain('--recheck');
  });
  it('blocks promotion without leaking diagnostics if re-verification fails after Kits change', () => {
    const nodeScript = `#!/bin/sh
echo "$*" >> "$RUNNER_TEMP/node-calls"
count=$(wc -l < "$RUNNER_TEMP/node-calls" | tr -d ' ')
if [ "$count" = "1" ]; then
  echo "Error: Supported Kits changed during API verification; retry deployment"
  exit 1
fi
echo ${sentinel}
exit 1
`;
    const result = runStep('Promote candidate revision to 100% traffic', true, nodeScript);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(sentinel);
    expect(result.stdout).toContain('traffic retained');
    expect(result.traffic).toBe('');
  });
});
