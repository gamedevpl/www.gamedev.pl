// Egress-restricted pool wiring; see ops gate-hardening.md, "Egress allow-list".

import { describe, expect, it } from 'vitest';
import { createCloudBuildOutcomeReader } from './gate-build-outcome.js';
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

describe('gate worker pool', () => {
  it('runs in the egress-restricted pool when one is configured, through its proxy', async () => {
    const { impl, calls } = stubFetch();
    const pool = 'projects/gamedevpl/locations/europe-west1/workerPools/gate-pool';
    const trigger = createCloudBuildGateTrigger({
      ...OPTIONS,
      fetchImpl: impl,
      runnerImage: 'img',
      workerPool: pool,
      egressProxy: 'http://10.90.0.10:3128',
    });

    await trigger!({ slug: 'comet-courier', version: 'v1' });

    expect(calls[0]!.url).toBe('https://cloudbuild.googleapis.com/v1/projects/gamedevpl/locations/europe-west1/builds');
    const body = calls[0]!.body as { options: Record<string, unknown>; steps: Array<{ env: string[] }> };
    expect(body.options).toEqual({ logging: 'CLOUD_LOGGING_ONLY', pool: { name: pool } });
    expect(body.steps[0]!.env).toEqual(
      expect.arrayContaining(['HTTPS_PROXY=http://10.90.0.10:3128', 'NODE_USE_ENV_PROXY=1']),
    );
    expect(body.steps[0]!.env.find((entry) => entry.startsWith('NO_PROXY='))).toContain('169.254.169.254');
  });

  it('keeps the default pool and no proxy until a pool is configured', async () => {
    const { impl, calls } = stubFetch();
    const trigger = createCloudBuildGateTrigger({ ...OPTIONS, fetchImpl: impl, egressProxy: 'http://10.90.0.10:3128' });

    await trigger!({ slug: 'comet-courier', version: 'v1' });

    expect(calls[0]!.url).toBe('https://cloudbuild.googleapis.com/v1/projects/gamedevpl/builds');
    expect(JSON.stringify(calls[0]!.body)).not.toContain('PROXY');
  });

  it('reads a pool build from its region, and an older one from the global path', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      urls.push(String(url));
      const regional = String(url).includes('/locations/');
      const found = regional ? String(url).endsWith('/pooled') : String(url).endsWith('/older');
      return { ok: found, status: found ? 200 : 404, json: async () => ({ status: 'FAILURE' }) } as Response;
    }) as unknown as typeof fetch;
    const read = createCloudBuildOutcomeReader({ ...OPTIONS, region: 'europe-west1', fetchImpl });

    expect(await read('pooled')).toBe('failed');
    expect(await read('older')).toBe('failed');
    expect(urls).toEqual([
      'https://cloudbuild.googleapis.com/v1/projects/gamedevpl/locations/europe-west1/builds/pooled',
      'https://cloudbuild.googleapis.com/v1/projects/gamedevpl/locations/europe-west1/builds/older',
      'https://cloudbuild.googleapis.com/v1/projects/gamedevpl/builds/older',
    ]);
  });
});
