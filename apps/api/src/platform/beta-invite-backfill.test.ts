import { describe, expect, it, vi } from 'vitest';

const { writes, deletion } = vi.hoisted(() => ({ writes: vi.fn(), deletion: { deleteField: true } }));
vi.mock('@google-cloud/firestore', () => ({
  FieldValue: { delete: () => deletion },
  Firestore: class {
    collection(name: string) {
      return {
        where: () => ({
          get: async () => ({
            empty: false,
            docs: [{ data: () => ({ id: 'invite', claimedUid: 'g:claimant', createdAt: 'now' }) }],
          }),
        }),
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () =>
              name === 'users'
                ? { email: 'victim@example.com', name: 'Claimant' }
                : { status: 'pending', email: 'other@example.com', requestedAt: 'earlier' },
          }),
          set: writes,
        }),
      };
    }
  },
}));

describe('claimed invite backfill', () => {
  it('approves only the claimant UID and removes an unverified stored email', async () => {
    const argv = process.argv;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = [...argv, '--apply'];
    try {
      await import('../../scripts/beta-invite-backfill.js');
      await vi.waitFor(() => expect(writes).toHaveBeenCalledOnce());
      expect(writes).toHaveBeenCalledWith(
        { uid: 'g:claimant', requestedAt: 'earlier', status: 'approved', name: 'Claimant', email: deletion },
        { merge: true },
      );
    } finally {
      process.argv = argv;
      log.mockRestore();
    }
  });
});
