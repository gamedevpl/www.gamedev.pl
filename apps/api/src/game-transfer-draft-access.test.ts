import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintToken } from './platform/submission-token.js';
import { InMemoryStore } from './platform/store.js';
import type { ManagedAvailabilityGate } from './agent-surface/managed-availability.js';
import {
  BUILD_SUMMARY,
  BUNDLE_HTML,
  GATE_REPORT,
  RECIPIENT,
  SECRET,
  SENDER,
  createTransferApp,
  gameWithHistory,
  handOver,
  session,
} from './game-transfer-fixtures.js';

// A token names a job; it never says who is holding it.

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('after a transfer, the sender cannot reach the draft', () => {
  it('cannot play it, by token or by slug', async () => {
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store);
    const app = await createTransferApp(store, apps);
    const token = mintToken(jobId, SECRET);

    // The token plays the draft while the game is theirs.
    const before = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: session(SENDER),
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().html).toBe(BUNDLE_HTML);

    await handOver(app, store, SENDER, RECIPIENT, at);

    // A signature naming the job is not a claim on it.
    const after = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: session(SENDER),
    });
    expect(after.statusCode).toBe(404);

    // The slug route already refused; the two now agree.
    const bySlug = await app.inject({ method: 'GET', url: '/api/drafts/comet-courier', headers: session(SENDER) });
    expect(bySlug.statusCode).toBe(404);

    const theirs = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: session(RECIPIENT),
    });
    expect(theirs.statusCode).toBe(200);
    expect(theirs.json().html).toBe(BUNDLE_HTML);
  });

  it('keeps the status receipt but not the prose written into it', async () => {
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store);
    const app = await createTransferApp(store, apps);
    const token = mintToken(jobId, SECRET);

    await handOver(app, store, SENDER, RECIPIENT, at);

    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: session(SENDER) });
    expect(status.statusCode).toBe(200);
    // Still a receipt: the gate ran, and it went red.
    expect(status.json().previewGate?.green).toBe(false);
    expect(status.json().recentBuilds?.[0]?.verdict).toBe('red');
    // Not a receipt: the prose behind the verdict.
    expect(status.json().previewGate?.report).toBeUndefined();
    expect(status.json().recentBuilds?.[0]?.summary).toBeUndefined();
    expect(status.json().recentBuilds?.[0]?.authorship).toBeUndefined();
    expect(status.json().recentBuilds?.[0]?.fileCount).toBeUndefined();

    const theirs = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: session(RECIPIENT) });
    expect(theirs.json().previewGate.report).toBe(GATE_REPORT);
    expect(theirs.json().recentBuilds[0].summary).toBe(BUILD_SUMMARY);
  });

  it('does not read the owner’s quota to answer a non-member', async () => {
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store);
    const asked: string[] = [];
    const gate: ManagedAvailabilityGate = {
      peek: async (uid) => {
        asked.push(uid);
        return { available: true };
      },
      checkAndSpend: async () => ({ available: true }),
      resolveVendor: async () => undefined,
    };
    const app = await createTransferApp(store, apps, gate);
    const token = mintToken(jobId, SECRET);

    await handOver(app, store, SENDER, RECIPIENT, at);

    asked.length = 0;
    const sender = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: session(SENDER) });
    expect(sender.statusCode).toBe(200);
    expect(sender.json().platformBuilder).toBeUndefined();
    // Redacting the answer is not enough: the read itself must not happen.
    expect(asked).toEqual([]);

    const member = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: session(RECIPIENT) });
    expect(member.json().platformBuilder).toEqual({ available: true });
    expect(asked).toContain(RECIPIENT);
  });
});
