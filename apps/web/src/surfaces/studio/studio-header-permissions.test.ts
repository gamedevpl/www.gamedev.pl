import { expect, it } from 'vitest';
import type { StudioGame } from '../../studioApi.js';
import { canShareStudioGame, canClaimPublishHandle } from './studio-header-permissions.js';

const game = { slug: 'review', lastKnownStatus: 'in_review' } as StudioGame;
it('does not offer publication or draft exposure to an editor', () => {
  const editor = { ...game, viewerRole: 'editor' as const };
  expect(canShareStudioGame(editor)).toBe(false);
  expect(canClaimPublishHandle(editor)).toBe(false);
  expect(canShareStudioGame({ ...editor, lastKnownStatus: 'published' })).toBe(true);
});
it('preserves owner draft sharing and handle claim', () => {
  expect(canShareStudioGame(game)).toBe(true);
  expect(canClaimPublishHandle(game)).toBe(true);
});
