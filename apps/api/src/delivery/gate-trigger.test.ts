import { describe, expect, it, vi } from 'vitest';
import { createCloudBuildGateTrigger, gateTriggerOptionsFromEnv } from './gate-trigger.js';

function stubFetch(response: Partial<Response> = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body ?? '{}')) });
    return {
      ok: true,
      status: 200,
      text: async () => '',
      // Cloud Build answers a create with a long-running operation carrying the build.
      json: async () => ({ metadata: { build: { id: 'build-abc' } } }),
      ...response,
    } as Response;
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
    // An acceptance run, so no --health: the verdict lands as `manifest.gate`.
    expect(steps[1]!.args[1]).not.toContain('--health');
  });

  it('forwards the preview-stills kill switch into the build step, or the switch is inert', async () => {
    // The gate runs inside this Cloud Build step, not in the API process, so an env var
    // set on the service reaches it only if it is forwarded here. Without that, the
    // advertised no-deploy kill switch does nothing — and a switch that is believed but
    // dead is worse than none (Codex, #583).
    const previous = process.env.GATE_PREVIEW_STILLS;
    try {
      process.env.GATE_PREVIEW_STILLS = '0';
      const off = stubFetch();
      await createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: off.impl })!({
        slug: 'comet-courier',
        version: 'v1',
        mode: 'preview',
      });
      const offStep = (off.calls[0]!.body.steps as Array<{ env?: string[] }>)[1]!;
      expect(offStep.env).toContain('GATE_PREVIEW_STILLS=0');

      // Default: nothing forwarded, so the runner's own default (on) stands.
      delete process.env.GATE_PREVIEW_STILLS;
      const on = stubFetch();
      await createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: on.impl })!({
        slug: 'comet-courier',
        version: 'v1',
        mode: 'preview',
      });
      const onStep = (on.calls[0]!.body.steps as Array<{ env?: string[] }>)[1]!;
      expect(onStep.env?.some((entry) => entry.startsWith('GATE_PREVIEW_STILLS'))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.GATE_PREVIEW_STILLS;
      else process.env.GATE_PREVIEW_STILLS = previous;
    }
  });

  it('runs a health re-gate as the same build with the health flag and its own tag', async () => {
    const { impl, calls } = stubFetch();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl });

    await trigger!({ slug: 'comet-courier', version: 'v1', mode: 'health' });

    const script = (calls[0]!.body.steps as Array<{ args: string[] }>)[1]!.args[1]!;
    expect(script).toContain("--slug 'comet-courier' --version 'v1' --health");
    // Tagged so a fleet re-check reads as one in the Cloud Build history, not as a
    // wave of failing acceptance gates.
    expect(calls[0]!.body.tags).toEqual(['gate', 'health', 'slug-comet-courier']);
  });

  it('points the capture harness at the browser it actually installed', async () => {
    // The harness spawns `google-chrome` by default; apt installs `chromium`. Without
    // this the gate reached capture and died on ENOENT — every run red, so no bundle,
    // so no draft preview for the creator watching their game get made.
    const { impl, calls } = stubFetch();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl });

    await trigger!({ slug: 'comet-courier', version: 'v1' });

    const script = (calls[0]!.body.steps as Array<{ args: string[] }>)[1]!.args[1]!;
    expect(script).toContain('command -v chromium');
    expect(script).toContain('export GAME_CAPTURE_CHROME=/usr/local/bin/gate-chrome');
    // The step runs as root, where Chrome exits before it opens the CDP pipe unless the
    // sandbox is off — capture then fails with an ECONNRESET that names nothing.
    expect(script).toContain('--no-sandbox');
    expect(script.indexOf('GAME_CAPTURE_CHROME')).toBeLessThan(script.indexOf('gate:run'));
  });

  it('reports the build id, so a line on the bill can be traced back to a game', async () => {
    // Previously read off the response and dropped, which left cost attribution with no
    // join at all between a GCP charge and the game that caused it.
    const { impl } = stubFetch();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl });

    await expect(trigger!({ slug: 'comet-courier', version: 'v1' })).resolves.toEqual({
      accepted: true,
      buildId: 'build-abc',
    });
  });

  it('keeps the gate running when the response is not the shape we expected', async () => {
    // The build is already queued by the time this is parsed. An unrecognised body costs
    // us the id, and must not cost us the verification — or tell the agent to resubmit.
    const { impl } = stubFetch({ json: async () => ({ nothing: 'useful' }) });
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl });

    await expect(trigger!({ slug: 'comet-courier', version: 'v1' })).resolves.toEqual({ accepted: true });
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

  it('runs as the least-privilege gate-runner SA with hard machine and time caps', async () => {
    // Hostile sources inherit whatever the build SA can do. Default Cloud Build /
    // Compute identities are too wide; caps live in the CONFIG we pin, not in the
    // candidate (BY-11 / infra/gate-hardening.md).
    const { impl, calls } = stubFetch();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl });

    await trigger!({ slug: 'comet-courier', version: 'v1' });

    const body = calls[0]!.body;
    expect(body.serviceAccount).toBe(
      'projects/gamedevpl/serviceAccounts/gate-runner@gamedevpl.iam.gserviceaccount.com',
    );
    expect(body.options).toMatchObject({
      logging: 'CLOUD_LOGGING_ONLY',
      machineType: 'E2_HIGHCPU_8',
      diskSizeGb: 50,
    });
    expect(body.timeout).toBe('1800s');
  });

  it('does not fail a delivery when the gate cannot be started', async () => {
    // The sources are already stored and the agent has finished. Answering it with an
    // error would make it upload everything again, storing a duplicate version of a
    // game that was received perfectly well. Unverified is the safe direction.
    const { impl } = stubFetch({ ok: false, status: 403 });
    const error = vi.fn();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl }, { error, info: vi.fn() });

    // Resolves with no build id, which is the same statement as "this cost nothing":
    // the caller books a gate run only when there was one.
    await expect(trigger!({ slug: 'comet-courier', version: 'v1' })).resolves.toEqual({});
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
