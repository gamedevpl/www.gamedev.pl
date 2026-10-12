import { describe, expect, it } from 'vitest';
import { unackedWarning } from './inbox-unacked.js';

describe('unackedWarning', () => {
  it('names the read notes that are still pending', () => {
    const warning = unackedWarning({ pendingMessages: [{ id: 'a' }, { id: 'b' }] }, new Set(['a']));
    expect(warning?.code).toBe('inbox_unacked');
    expect(warning?.message).toContain('ackInboxIds ["a"]');
  });

  it('stays quiet for unread notes, acked notes or no pending list', () => {
    expect(unackedWarning({ pendingMessages: [{ id: 'b' }] }, new Set(['a']))).toBeNull();
    expect(unackedWarning({ pendingMessages: [] }, new Set(['a']))).toBeNull();
    expect(unackedWarning({}, new Set(['a']))).toBeNull();
  });
});
