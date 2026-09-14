import { describe, expect, it } from 'vitest';
import { effectiveStatus, isPending, newTransferInvitation, TRANSFER_INVITE_TTL_MS } from './game-transfer.js';

const AT = '2026-01-01T00:00:00.000Z';

describe('game transfer invitation', () => {
  it('is minted pending, expiring seven days later', () => {
    const invite = newTransferInvitation('sky', 'g:ada', 'g:grace', 2, AT);
    expect(invite.status).toBe('pending');
    expect(Date.parse(invite.expiresAt) - Date.parse(AT)).toBe(TRANSFER_INVITE_TTL_MS);
  });

  it('reads as pending before its deadline', () => {
    const invite = newTransferInvitation('sky', 'g:ada', 'g:grace', 2, AT);
    const justBefore = new Date(Date.parse(invite.expiresAt) - 1).toISOString();
    expect(effectiveStatus(invite, justBefore)).toBe('pending');
    expect(isPending(invite, justBefore)).toBe(true);
  });

  it('reads as expired once its deadline has passed, without being rewritten', () => {
    const invite = newTransferInvitation('sky', 'g:ada', 'g:grace', 2, AT);
    expect(effectiveStatus(invite, invite.expiresAt)).toBe('expired');
    expect(isPending(invite, invite.expiresAt)).toBe(false);
    expect(invite.status).toBe('pending');
  });

  it('a terminal status is never overridden by expiry', () => {
    const invite = { ...newTransferInvitation('sky', 'g:ada', 'g:grace', 2, AT), status: 'cancelled' as const };
    const at = new Date(Date.parse(invite.expiresAt) + 1_000).toISOString();
    expect(effectiveStatus(invite, at)).toBe('cancelled');
  });

  it('null is never pending', () => {
    expect(isPending(null, AT)).toBe(false);
  });
});
