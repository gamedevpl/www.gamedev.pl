import { describe, expect, it } from 'vitest';
import {
  brandedNamedTitle,
  brandedPageTitle,
  humanizeSlug,
  resolveDocumentTitle,
  type DocumentTitleCopy,
} from './pageTitle';

const copy: DocumentTitleCopy = {
  home: 'Gamedev.pl — Describe a game, play it',
  status: 'Your game is in the works',
  draft: 'A game in the making',
  join: 'Join the game',
  health: 'Telemetry',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  playNamed: 'Play {{title}}',
  draftNamed: 'Draft {{title}}',
  statusNamed: 'Status · {{title}}',
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
    expect(brandedNamedTitle('Play {{title}}', 'Privacy Policy')).toBe(
      'Play Privacy Policy — Gamedev.pl',
    );
    expect(brandedNamedTitle('Play {{title}}', 'Privacy Policy')).not.toBe(
      brandedPageTitle('Privacy Policy'),
    );
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
    expect(
      resolveDocumentTitle({ view: 'play', slug: 'sky-dodge' }, { copy, playTitle: 'Sky Dodge' }),
    ).toBe('Play Sky Dodge — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'play', slug: 'sky-dodge' }, { copy })).toBe(
      'Play Sky Dodge — Gamedev.pl',
    );
  });

  it('titles draft / status / join / health / legal routes', () => {
    expect(resolveDocumentTitle({ view: 'draft', slug: 'space-runner' }, { copy })).toBe(
      'A game in the making — Gamedev.pl',
    );
    expect(
      resolveDocumentTitle(
        { view: 'draft', slug: 'space-runner' },
        { copy, draftTitle: 'Space Runner' },
      ),
    ).toBe('Draft Space Runner — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'status', token: 'tok' }, { copy })).toBe(
      'Your game is in the works — Gamedev.pl',
    );
    expect(
      resolveDocumentTitle({ view: 'status', token: 'tok' }, { copy, statusTitle: 'Coin Catcher' }),
    ).toBe('Status · Coin Catcher — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'join', code: 'K7M3QP', token: 't' }, { copy })).toBe(
      'Join the game — Gamedev.pl',
    );
    expect(resolveDocumentTitle({ view: 'health' }, { copy })).toBe('Telemetry — Gamedev.pl');
    expect(resolveDocumentTitle({ view: 'legal', doc: 'privacy' }, { copy })).toBe(
      'Privacy Policy — Gamedev.pl',
    );
    expect(resolveDocumentTitle({ view: 'legal', doc: 'terms' }, { copy })).toBe(
      'Terms of Service — Gamedev.pl',
    );
  });
});
