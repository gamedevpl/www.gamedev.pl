import { describe, expect, it } from 'vitest';
import { createCloudBuildGateTrigger } from './gate-trigger.js';

function stubFetch() {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body ?? '{}')) });
    return { ok: true, status: 200, text: async () => '', json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const OPTIONS = { project: 'gamedevpl', bucket: 'gamedevpl-games-store', getAccessToken: async () => 'token' };

describe('buildSpec', () => {
  it('runs straight out of the prebuilt image when one is configured', async () => {
    const { impl, calls } = stubFetch();
    const image = 'europe-west1-docker.pkg.dev/gamedevpl/gamedev/gate-runner:abc1234';
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, runnerImage: image, fetchImpl: impl });

    await trigger!({ slug: 'comet-courier', version: 'v1' });

    const steps = calls[0]!.body.steps as Array<{ id: string; name: string; args: string[] }>;
    // One step, not two: nothing is cloned.
    expect(steps).toHaveLength(1);
    expect(steps[0]!.id).toBe('run-gate');
    expect(steps[0]!.name).toBe(image);
    const script = steps[0]!.args[1]!;
    expect(script).toContain("--slug 'comet-courier' --version 'v1'");
    // The four phases we stopped paying for.
    expect(script).not.toContain('apt-get');
    expect(script).not.toContain('npm ci');
    expect(script).not.toContain('build:packages');
    expect(script).toContain('cd /opt/platform');
  });

  it('still builds its own environment when no image is configured', async () => {
    // Hand runs and un-redeployed environments take this path.
    const { impl, calls } = stubFetch();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl });

    await trigger!({ slug: 'comet-courier', version: 'v1' });

    const steps = calls[0]!.body.steps as Array<{ id: string; args: string[] }>;
    expect(steps.map((step) => step.id)).toEqual(['checkout-platform', 'run-gate']);
    expect(steps[1]!.args[1]).toContain('apt-get install');
    expect(steps[1]!.args[1]).toContain('npm ci --no-audit --no-fund && npm run build:packages');
  });

  it('carries the same capability and kill switch into the image step', async () => {
    // Forwarding lives in one place now; prove it survived.
    const previous = process.env.GATE_PREVIEW_STILLS;
    process.env.GATE_PREVIEW_STILLS = '0';
    try {
      const { impl, calls } = stubFetch();
      const trigger = createCloudBuildGateTrigger({
        ...OPTIONS,
        runnerImage: 'europe-west1-docker.pkg.dev/gamedevpl/gamedev/gate-runner:abc1234',
        fetchImpl: impl,
      });

      await trigger!({ slug: 'comet-courier', version: 'v1', mode: 'health' });

      const steps = calls[0]!.body.steps as Array<{ env: string[]; secretEnv: string[]; args: string[] }>;
      expect(steps[0]!.env).toContain('GATE_PREVIEW_STILLS=0');
      expect(steps[0]!.env).toContain('GAMES_STORE_BUCKET=gamedevpl-games-store');
      expect(steps[0]!.secretEnv).toEqual(['GAMES_REPO_TOKEN']);
      expect(steps[0]!.args[1]).toContain('--health');
    } finally {
      if (previous === undefined) delete process.env.GATE_PREVIEW_STILLS;
      else process.env.GATE_PREVIEW_STILLS = previous;
    }
  });
});
