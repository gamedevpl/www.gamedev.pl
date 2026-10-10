import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const step = workflow.split('      - name: Build and push the gate runner image\n')[1]?.split('\n      - name:')[0];
const script = step?.split('        run: |\n')[1]?.replace(/^ {10}/gm, '');
const registryDigest = `sha256:${'a'.repeat(64)}`;
const localDigest = `sha256:${'b'.repeat(64)}`;
const image = 'europe-west1-docker.pkg.dev/test-project/gamedev/gate-runner';

function runStep(overrides = {}) {
  expect(script).toBeTruthy();
  const dir = mkdtempSync(path.join(tmpdir(), 'gate-image-deploy-'));
  const output = path.join(dir, 'github-env');
  const commands = path.join(dir, 'commands');
  try {
    writeFileSync(output, '');
    writeFileSync(commands, '');
    writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ 'containerimage.digest': localDigest }));
    writeFileSync(
      path.join(dir, 'docker'),
      `#!/bin/bash
printf '%s\\n' "docker $*" >> "$COMMAND_LOG"
if [ "$1" = "$MOCK_DOCKER_FAILURE" ]; then exit 1; fi
`,
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(dir, 'gcloud'),
      `#!/bin/bash
printf '%s\\n' "gcloud $*" >> "$COMMAND_LOG"
if [ "$1 $2 $3" = 'secrets versions access' ]; then
  printf '%s\\n' "$MOCK_READY"
elif [ "$1 $2 $3 $4" = 'artifacts docker images describe' ]; then
  if [[ "$5" = *@* ]]; then
    if [ "$MOCK_PINNED_FAILURE" = 1 ]; then exit 1; fi
    printf '%s\\n' "$MOCK_PINNED_DIGEST"
  else
    if [ "$MOCK_TAG_FAILURE" = 1 ]; then exit 1; fi
    printf '%s\\n' "$MOCK_TAG_DIGEST"
  fi
else
  exit 64
fi
`,
      { mode: 0o755 },
    );
    const result = spawnSync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-e',
        '-o',
        'pipefail',
        '-c',
        script
          .replaceAll('/tmp/games_token', path.join(dir, 'token'))
          .replaceAll('/tmp/gate-meta.json', path.join(dir, 'metadata.json')),
      ],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          PATH: `${dir}:${process.env.PATH}`,
          PROJECT_ID: 'test-project',
          REGION: 'europe-west1',
          REPO: 'gamedev',
          DEPLOY_SHA: '123456789abcdef',
          GAMES_TOKEN: 'fixture',
          GITHUB_ENV: output,
          COMMAND_LOG: commands,
          MOCK_READY: 'granted fixture',
          MOCK_TAG_DIGEST: registryDigest,
          MOCK_PINNED_DIGEST: registryDigest,
          ...overrides,
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    return { env: readFileSync(output, 'utf8'), commands: readFileSync(commands, 'utf8'), stdout: result.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('gate runner image deploy', () => {
  it('pins the registry digest and verifies it when local metadata has a different digest', () => {
    const result = runStep();
    expect(result.env).toBe(`GATE_IMAGE=\nGATE_IMAGE=${image}@${registryDigest}\n`);
    expect(result.commands).toContain(`images describe ${image}:1234567`);
    expect(result.commands).toContain(`images describe ${image}@${registryDigest}`);
    expect(result.commands.indexOf('docker push')).toBeLessThan(result.commands.indexOf('images describe'));
    expect(result.env).not.toContain(localDigest);
  });

  it.each(['', 'sha256:short', 'sha256:' + 'g'.repeat(64), registryDigest + '\nextra'])(
    'keeps the from-scratch path for an invalid registry digest: %j',
    (digest) => {
      const result = runStep({ MOCK_TAG_DIGEST: digest });
      expect(result.env).toBe('GATE_IMAGE=\n');
      expect(result.stdout).toContain('::warning::');
      expect(result.commands).not.toContain(`images describe ${image}@`);
    },
  );

  it.each([
    { MOCK_TAG_FAILURE: '1' },
    { MOCK_PINNED_FAILURE: '1' },
    { MOCK_PINNED_DIGEST: localDigest },
    { MOCK_READY: 'not-granted' },
    { MOCK_DOCKER_FAILURE: 'build' },
    { MOCK_DOCKER_FAILURE: 'push' },
  ])('keeps the from-scratch path when publication or readiness fails: %j', (overrides) => {
    const result = runStep(overrides);
    expect(result.env).toBe('GATE_IMAGE=\n');
    expect(result.stdout).toContain('::warning::');
  });
});
