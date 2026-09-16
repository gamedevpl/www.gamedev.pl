import { describe, expect, it } from 'vitest';
import { canActOnGame, isGameMember, memberKey, viewerRoleOnGame } from './game-access-permissions.js';
import type { ResolvedGameAccess } from './game-access-resolve.js';

function access(ownerUid: string, editorUids: string[] = []): ResolvedGameAccess {
  return {
    owner: { kind: 'creator', uid: ownerUid },
    editorUids,
    accessRevision: 2,
    source: 'canonical',
  };
}

describe('canActOnGame', () => {
  it('keeps owner-only verbs off editors', () => {
    const shared = access('g:ada', ['g:bea']);
    expect(canActOnGame(shared, 'g:ada', 'publish')).toBe(true);
    expect(canActOnGame(shared, 'g:bea', 'publish')).toBe(false);
    expect(canActOnGame(shared, 'g:bea', 'reviewProposals')).toBe(false);
    expect(canActOnGame(shared, 'g:bea', 'manageMembers')).toBe(false);
    expect(canActOnGame(shared, 'g:bea', 'transfer')).toBe(false);
    expect(canActOnGame(shared, 'g:bea', 'delete')).toBe(false);
    expect(canActOnGame(shared, 'g:ada', 'leave')).toBe(false);
  });

  it('admits an accepted editor to read, edit and build', () => {
    const shared = access('g:ada', ['g:bea']);
    expect(canActOnGame(shared, 'g:bea', 'read')).toBe(true);
    expect(canActOnGame(shared, 'g:bea', 'edit')).toBe(true);
    expect(canActOnGame(shared, 'g:bea', 'build')).toBe(true);
    expect(canActOnGame(shared, 'g:bea', 'leave')).toBe(true);
    expect(canActOnGame(shared, 'g:dana', 'read')).toBe(false);
  });

  it('freezes remaining editors when the owner is platform-held', () => {
    const frozen: ResolvedGameAccess = {
      owner: { kind: 'platform', reason: 'owner_deleted' },
      editorUids: ['g:bea'],
      accessRevision: 4,
      source: 'canonical',
    };
    expect(canActOnGame(frozen, 'g:bea', 'read')).toBe(true);
    expect(canActOnGame(frozen, 'g:bea', 'edit')).toBe(false);
    expect(canActOnGame(frozen, 'g:bea', 'build')).toBe(false);
    expect(canActOnGame(frozen, 'g:bea', 'leave')).toBe(true);
  });
});

describe('viewerRoleOnGame', () => {
  it('names owner and editor without widening membership', () => {
    const shared = access('g:ada', ['g:bea']);
    expect(viewerRoleOnGame(shared, 'g:ada')).toBe('owner');
    expect(viewerRoleOnGame(shared, 'g:bea')).toBe('editor');
    expect(viewerRoleOnGame(shared, 'g:dana')).toBeNull();
    expect(isGameMember(shared, 'g:bea')).toBe(true);
    expect(isGameMember(shared, 'g:dana')).toBe(false);
  });
});

describe('memberKey', () => {
  it('is stable and does not embed the uid', () => {
    const key = memberKey('sky', 'g:bea');
    expect(key).toHaveLength(16);
    expect(key).not.toContain('bea');
    expect(memberKey('sky', 'g:bea')).toBe(key);
    expect(memberKey('sky', 'g:cal')).not.toBe(key);
  });
});
