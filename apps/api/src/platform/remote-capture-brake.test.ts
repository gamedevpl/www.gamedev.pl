import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';
import {
  createRemoteCaptureRevoker,
  createRemoteCaptureRevokerFromEnv,
  withoutMember,
} from './remote-capture-brake.js';

const sessionSecret = 'dev-session-secret-change-me';
const job = 'projects/p/locations/europe-west1/jobs/capture';
const agent = 'serviceAccount:agent@p.iam.gserviceaccount.com';

function pushBody(payload: unknown) {
  return { message: { data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') } };
}

describe('remote capture brake', () => {
  it('drops only the agent, and bindings it leaves empty', () => {
    const { policy, removed } = withoutMember(
      {
        etag: 'e1',
        bindings: [
          { role: 'roles/run.jobsExecutorWithOverrides', members: [agent] },
          { role: 'roles/run.viewer', members: [agent, 'user:owner@example.com'] },
        ],
      },
      agent,
    );
    expect(removed).toBe(2);
    expect(policy).toEqual({
      etag: 'e1',
      bindings: [{ role: 'roles/run.viewer', members: ['user:owner@example.com'] }],
    });
  });

  it('reads then writes the job policy with its etag, and writes nothing when already revoked', async () => {
    const calls: [string, string, unknown][] = [];
    let policy = { etag: 'e1', bindings: [{ role: 'roles/run.jobsExecutorWithOverrides', members: [agent] }] };
    const revoke = createRemoteCaptureRevoker(job, agent, async (method, url, body) => {
      calls.push([method, url, body]);
      if (method === 'POST') policy = { etag: 'e2', bindings: (body as { policy: typeof policy }).policy.bindings };
      return policy;
    });
    expect(await revoke()).toEqual({ removed: 1 });
    expect(calls[0]).toEqual(['GET', `https://run.googleapis.com/v2/${job}:getIamPolicy`, undefined]);
    expect(calls[1]).toEqual([
      'POST',
      `https://run.googleapis.com/v2/${job}:setIamPolicy`,
      { policy: { etag: 'e1', bindings: [] } },
    ]);
    expect(await revoke()).toEqual({ removed: 0 });
    expect(calls).toHaveLength(3);
  });

  it('is off unless both variables name a job and a member', () => {
    expect(createRemoteCaptureRevokerFromEnv({})).toBeUndefined();
    expect(createRemoteCaptureRevokerFromEnv({ REMOTE_CAPTURE_JOB: job })).toBeUndefined();
    expect(
      createRemoteCaptureRevokerFromEnv({ REMOTE_CAPTURE_JOB: 'capture', REMOTE_CAPTURE_EXECUTOR: agent }),
    ).toBeUndefined();
    expect(createRemoteCaptureRevokerFromEnv({ REMOTE_CAPTURE_JOB: job, REMOTE_CAPTURE_EXECUTOR: agent })).toBeTypeOf(
      'function',
    );
  });

  it('a budget naming the lane pauses at once and retries a failed revoke until it lands', async () => {
    const store = new InMemoryStore();
    let attempts = 0;
    const app = await buildApp({
      store,
      sessionSecret,
      spendBrakeRoutes: {
        internalAuthVerifier: { verify: async () => true },
        revokeRemoteCapture: async () => {
          attempts++;
          if (attempts === 1) throw new Error('etag conflict');
          return { removed: 1 };
        },
      },
    });
    const deliver = () =>
      app.inject({
        method: 'POST',
        url: '/api/internal/spend-brake',
        payload: pushBody({ budgetDisplayName: 'Remote GPU capture lanes=remotecapture', alertThresholdExceeded: 1.0 }),
      });
    const incident = 'budget:Remote GPU capture lanes=remotecapture:spent:1';

    const first = await deliver();
    expect(first.statusCode).toBe(503);
    expect((await store.getCreationLimits())?.handledBrakeIncidents).toEqual([incident]);

    const second = await deliver();
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ revoked: true, reason: 'already_handled' });
    expect((await store.getCreationLimits())?.handledBrakeIncidents).toEqual([incident, `${incident}:revoked`]);

    const third = await deliver();
    expect(third.json()).toEqual({ paused: [], reason: 'already_handled' });
    expect(attempts).toBe(2);
    await app.close();
  });

  it('acknowledges when no revoker is configured, since a retry cannot help', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret,
      spendBrakeRoutes: { internalAuthVerifier: { verify: async () => true }, revokeRemoteCapture: undefined },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/spend-brake',
      payload: pushBody({ budgetDisplayName: 'Remote GPU capture lanes=remotecapture', alertThresholdExceeded: 1.0 }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().paused).toEqual(['remoteCapture']);
    await app.close();
  });
});
