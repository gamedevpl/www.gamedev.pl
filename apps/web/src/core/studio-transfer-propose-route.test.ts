import { describe, expect, it } from 'vitest';
import { canonicalPath, navUpTarget, parsePathRoute, studioTransferProposePath } from './router.js';
import { resolveDocumentTitle, type DocumentTitleCopy } from '../pageTitle.js';

const copy: DocumentTitleCopy = {
  home: 'Gamedev.pl — Describe a game, play it',
  join: 'Join the game',
  invite: 'Beta invitation',
  health: 'Telemetry',
  review: 'Game review',
  studio: 'Creator Studio',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  contact: 'Contact',
  connect: 'Connect an agent',
  create: 'Build a game',
  party: 'Party mode',
  proposals: 'My proposals',
  notFound: 'Page not found',
  playNamed: 'Play {{title}}',
  studioNamed: 'Studio · {{title}}',
  creatorNamed: '{{title}}',
  gameNamed: '{{title}}',
};

describe('studio transfer proposal route', () => {
  const proposalId = '11111111-2222-4333-8444-555555555555';

  it('parses, canonicalizes, and titles the confirmation URL', () => {
    expect(parsePathRoute(`/studio/sky-dodge/transfer/propose/${proposalId}`)).toEqual({
      view: 'studioTransferPropose',
      game: 'sky-dodge',
      proposalId,
    });
    expect(studioTransferProposePath('sky-dodge', proposalId)).toBe(`/studio/sky-dodge/transfer/propose/${proposalId}`);
    expect(canonicalPath(`/studio/sky-dodge/transfer/propose/${proposalId}`)).toBeNull();
    expect(navUpTarget({ view: 'studioTransferPropose', game: 'sky-dodge', proposalId })).toEqual({
      path: '/studio',
      labelKey: 'upStudio',
    });
    expect(
      resolveDocumentTitle(
        { view: 'studioTransferPropose', game: 'tok', proposalId },
        { copy, studioTitle: 'Coin Catcher' },
      ),
    ).toBe('Studio · Coin Catcher — Gamedev.pl');
  });
});
