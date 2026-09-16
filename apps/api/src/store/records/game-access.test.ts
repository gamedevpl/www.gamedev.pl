import { describe, expect, it } from 'vitest';
import { DELETED_ACCOUNT_UID } from './identity.js';
import {
  MAX_GAME_MEMBERS,
  membersOf,
  newGameAccess,
  transferredAccess,
  withEditorAdded,
  withEditorRemoved,
  withMemberErased,
} from './game-access.js';

const AT = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';

describe('editor membership helpers', () => {
  it('adds and removes an editor without promoting anyone', () => {
    const base = newGameAccess('sky', 'g:ada', AT, 1);
    const added = withEditorAdded(base, 'g:bea', LATER);
    expect(added).toMatchObject({
      ownerUid: 'g:ada',
      editorUids: ['g:bea'],
      memberUids: ['g:ada', 'g:bea'],
      accessRevision: 2,
    });
    expect(withEditorAdded(added!, 'g:bea', LATER)).toBeNull();
    expect(withEditorAdded(added!, 'g:ada', LATER)).toBeNull();
    const removed = withEditorRemoved(added!, 'g:bea', LATER);
    expect(removed).toMatchObject({ ownerUid: 'g:ada', editorUids: [], memberUids: ['g:ada'], accessRevision: 3 });
  });

  it('keeps remaining editors across transfer and drops the former owner', () => {
    const shared = withEditorAdded(newGameAccess('sky', 'g:ada', AT, 1), 'g:bea', LATER)!;
    const withCal = withEditorAdded(shared, 'g:cal', LATER)!;
    const moved = transferredAccess(withCal, 'g:dana', LATER);
    expect(moved.ownerUid).toBe('g:dana');
    expect(moved.editorUids).toEqual(['g:bea', 'g:cal']);
    expect(moved.memberUids).toEqual(membersOf('g:dana', ['g:bea', 'g:cal']));
    expect(moved.editorUids).not.toContain('g:ada');
  });

  it('does not promote an editor when the owner is erased', () => {
    const shared = withEditorAdded(newGameAccess('sky', 'g:ada', AT, 1), 'g:bea', LATER)!;
    const erased = withMemberErased(shared, 'g:ada', DELETED_ACCOUNT_UID, LATER);
    expect(erased?.ownerUid).toBe(DELETED_ACCOUNT_UID);
    expect(erased?.editorUids).toEqual(['g:bea']);
  });

  it('erasing an editor leaves the owner and the game intact', () => {
    const shared = withEditorAdded(newGameAccess('sky', 'g:ada', AT, 1), 'g:bea', LATER)!;
    const erased = withMemberErased(shared, 'g:bea', DELETED_ACCOUNT_UID, LATER);
    expect(erased?.ownerUid).toBe('g:ada');
    expect(erased?.editorUids).toEqual([]);
  });

  it('refuses a twenty-sixth member', () => {
    let record = newGameAccess('sky', 'g:ada', AT, 1);
    for (let i = 0; i < MAX_GAME_MEMBERS - 1; i += 1) {
      record = withEditorAdded(record, `g:e${i}`, LATER)!;
    }
    expect(withEditorAdded(record, 'g:overflow', LATER)).toBeNull();
  });
});
