import { describe, expect, it } from 'vitest';
import {
  brandedNamedTitle,
  brandedPageTitle,
  humanizeSlug,
  resolveDocumentTitle,
  type DocumentTitleCopy,
} from './pageTitle.js';

const copy: DocumentTitleCopy = {
  home: 'Gamedev.pl — Describe a game, play it',
  draft: 'A game in the making',
  join: 'Join the game',
  health: 'Telemetry',
  studio: 'Creator Studio',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  contact: 'Contact',
  proposals: 'My proposals',
  notFound: 'Page not found',
  playNamed: 'Play {{title}}',
  draftNamed: 'Draft {{title}}',
  studioNamed: 'Studio · {{title}}',
  creatorNamed: '{{title}}',
  gameNamed: '{{title}}',
};

describe('brandedPageTitle', () => {
  it('suffixes the brand', () => {
    expect(brandedPageTitle('Sky Dodge')).toBe('Sky Dodge — Gamedev.pl');
  });

  it('falls back to the brand alone for blank input', () => {
    expect(brandedPageTitle('')).toBe('Gamedev.pl');
    expect(brandedPageTitle('   ')).toBe('Gamedev.pl');
  });
});

describe('brandedNamedTitle', () => {
  it('prefixes a user-supplied name before branding', () => {
    expect(brandedNamedTitle('Play {{title}}', 'Sky Dodge')).toBe('Play Sky Dodge — Gamedev.pl');
  });

  it('cannot spoof a legal page title', () => {
    expect(brandedNamedTitle('Play {{title}}', 'Privacy Policy')).toBe('Play Privacy Policy — Gamedev.pl');
    expect(brandedNamedTitle('Play {{title}}', 'Privacy Policy')).not.toBe(brandedPageTitle('Privacy Policy'));
  });
});

describe('humanizeSlug', () => {
  it('title-cases kebab segments', () => {
    expect(humanizeSlug('sky-dodge')).toBe('Sky Dodge');
    expect(humanizeSlug('dodge')).toBe('Dodge');
  });
});

describe('resolveDocumentTitle', () => {
  it('uses the full home title by default', () => {
    expect(resolveDocumentTitle({ view: 'home' }, { copy })).toBe(copy.home);
  });

  it('prefixes an open stage title on home', () => {
    expect(resolveDocumentTitle({ view: 'home' }, { copy, stageTitle: 'Circus Cat' })).toBe(
      'Play Circus Cat — Gamedev.pl',
    );
  });

  it('prefixes the play title when known, otherwise humanizes the slug', () => {
    expect(resolveDocumentTitle({ view: 'play', slug: 'sky-dodge' }, { copy, playTitle: 'Sky Dodge' })).toBe(
      'Play Sky Dodge — Gamedev.pl',
    );
    expect(resolveDocumentTitle({ view: 'play', slug: 'sky-dodge' }, { copy })).toBe('Play Sky Dodge — Gamedev.pl');
  });

  it('titles draft / studio / join / health / legal routes', () => {
    expect(resolveDocumentTitle({ view: 'draft', slug: 'space-runner' }, { copy })).toBe(
      'A game in the making — Gamedev.pl',
    );
    expect(resolveDocumentTitle({ view: 'draft', slug: 'space-runner' }, { copy, draftTitle: 'Space Runner' })).toBe(
      'Draft Space Runner — Gamedev.pl',
    );
    expect(resolveDocumentTitle({ view: 'studio' }, { copy })).toBe('Creator Studio — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'studio', game: 'tok' }, { copy, studioTitle: 'Coin Catcher' })).toBe(
      'Studio · Coin Catcher — Gamedev.pl',
    );
    expect(resolveDocumentTitle({ view: 'join', code: 'K7M3QP', token: 't' }, { copy })).toBe(
      'Join the game — Gamedev.pl',
    );
    expect(resolveDocumentTitle({ view: 'admin', section: 'queue' }, { copy })).toBe('Telemetry — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'legal', doc: 'privacy' }, { copy })).toBe('Privacy Policy — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'legal', doc: 'terms' }, { copy })).toBe('Terms of Service — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'contact' }, { copy })).toBe('Contact — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'creator', handle: 'ada' }, { copy, creatorName: 'Ada Lovelace' })).toBe(
      'Ada Lovelace — Gamedev.pl',
    );
    expect(resolveDocumentTitle({ view: 'creator', handle: 'ada' }, { copy })).toBe('ada — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'notFound' }, { copy })).toBe('Page not found — Gamedev.pl');
  });

  it('titles the public game page with the loaded title, else the humanized slug', () => {
    expect(
      resolveDocumentTitle(
        { view: 'game', handle: 'nightshift', slug: 'neon-courier' },
        { copy, gameTitle: 'Neon Courier' },
      ),
    ).toBe('Neon Courier — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'game', handle: 'nightshift', slug: 'neon-courier' }, { copy })).toBe(
      'Neon Courier — Gamedev.pl',
    );
  });
});
