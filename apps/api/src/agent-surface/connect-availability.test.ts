import { expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { mintToken } from '../platform/submission-token.js';
import { createManagedAvailabilityGate } from './managed-availability.js';

it.each(['off', 'auto', 'coming_soon'] as const)(
  'advertises platform handoff only when managed mode is available (%s)',
  async (mode) => {
    const store = new InMemoryStore();
    const uid = 'g:creator';
    await store.upsertUser({ uid, betaStatus: 'approved' });
    await store.createSubmission(123, uid, 'Game');
    await store.setSubmissionSlug(123, 'game');
    await store.setRoundBuilder(123, 'self');
    await store.recordJobTransition(123, { to: 'dispatched', at: new Date().toISOString(), by: 'system' });
    await store.setCreationLimits({ managedBuilderMode: mode }, 'g:admin');
    const gate = createManagedAvailabilityGate({
      store,
      hasPlatformBackend: true,
      configuredVendors: new Set(['anthropic']),
      defaultVendor: 'anthropic',
      ttlMs: 0,
    });
    const spend = vi.spyOn(gate, 'checkAndSpend');
    const app = await buildApp({
      store,
      sessionSecret: 'session-secret',
      submissionRoutes: {
        submissionTokenSecret: 'submission-secret',
        managedAvailabilityGate: gate,
      },
    });
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/submissions/${mintToken(123, 'submission-secret')}/connect`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, 'session-secret')}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().canSwitchToPlatform).toBe(mode === 'auto');
      expect(spend).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  },
);
