import { describe, expect, it, vi } from 'vitest';
import { createCloudBuildGateTrigger, gateTriggerOptionsFromEnv } from './gate-trigger.js';

function stubFetch(response: Partial<Response> = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body ?? '{}')) });
    return { ok: true, status: 200, text: async () => '', ...response } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const OPTIONS = { project: 'gamedevpl', bucket: 'gamedevpl-games-store', getAccessToken: async () => 'token' };

describe('createCloudBuildGateTrigger', () => {
  it('starts a gate build for the delivered version', async () => {
    const { impl, calls } = stubFetch();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl });

    await trigger!({ slug: 'comet-courier', version: 'v1' });

    expect(calls[0]!.url).toContain('/projects/gamedevpl/builds');
    const steps = calls[0]!.body.steps as Array<{ args: string[] }>;
    expect(steps[1]!.args[1]).toContain("--slug 'comet-courier' --version 'v1'");
  });

  it('uses the read-only games token, never a credential that can start agent work', async () => {
    // The gate runs agent-authored code. A token that could dispatch work has no
    // business in that container, which is the same reasoning as cloudbuild-gate.yaml.
    const { impl, calls } = stubFetch();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl });

    await trigger!({ slug: 'comet-courier', version: 'v1' });

    const secrets = calls[0]!.body.availableSecrets as { secretManager: Array<{ versionName: string; env: string }> };
    expect(secrets.secretManager[0]!.versionName).toContain('secrets/github-token');
    expect(JSON.stringify(calls[0]!.body)).not.toContain('agent-tasks-token');
  });

  it('does not fail a delivery when the gate cannot be started', async () => {
    // The sources are already stored and the agent has finished. Answering it with an
    // error would make it upload everything again, storing a duplicate version of a
    // game that was received perfectly well. Unverified is the safe direction.
    const { impl } = stubFetch({ ok: false, status: 403 });
    const error = vi.fn();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl }, { error, info: vi.fn() });

    await expect(trigger!({ slug: 'comet-courier', version: 'v1' })).resolves.toBeUndefined();
    // Loud, because the consequence is silent: nothing will ever verify this candidate
    // unless somebody notices.
    expect(error).toHaveBeenCalled();
  });

  it('is absent when no gate project is configured, rather than failing at delivery time', async () => {
    // Local development and tests deliver without a build backend; an error there would
    // be one nobody can act on.
    expect(createCloudBuildGateTrigger(null)).toBeUndefined();
    expect(createCloudBuildGateTrigger({ project: '', bucket: 'b' })).toBeUndefined();
  });
});

describe('gateTriggerOptionsFromEnv', () => {
  it('needs both a project and a bucket before it will claim to be configured', () => {
    // Individual keys, not a wholesale `process.env = saved`: reassigning it replaces
    // Node's special env object with a plain one and the damage lands in whichever
    // suite happens to run next.
    const keys = ['GATE_BUILD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GAMES_STORE_BUCKET'] as const;
    const saved = new Map(keys.map((key) => [key, process.env[key]]));
    try {
      delete process.env.GATE_BUILD_PROJECT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      process.env.GAMES_STORE_BUCKET = 'b';
      expect(gateTriggerOptionsFromEnv()).toBeNull();

      process.env.GATE_BUILD_PROJECT = 'p';
      expect(gateTriggerOptionsFromEnv()).toMatchObject({ project: 'p', bucket: 'b' });
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
