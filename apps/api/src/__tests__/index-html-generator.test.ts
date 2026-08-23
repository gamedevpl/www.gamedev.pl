import { describe, it, expect } from 'vitest';
import { generateIndexHtml, hasPlayableHowToPlay } from '../catalog/index-html-generator.js';

describe('index-html-generator', () => {
  it('generates a basic index.html fragment', () => {
    const manifest = {
      howToPlay: {
        controls: [
          {
            keys: 'WASD',
            action: { en: 'Move', pl: 'Ruch' },
          },
        ],
        goal: { en: 'Win the game', pl: 'Wygraj grę' },
        hint: { en: 'Press WASD to move', pl: 'Naciśnij WASD aby się ruszać' },
      },
      description: {
        en: 'A test game',
        pl: 'Gra testowa',
      },
    };

    const spec = { title: 'Test Game' };

    const html = generateIndexHtml(manifest, spec);

    // Check for required elements
    expect(html).toContain('id="game-title"');
    expect(html).toContain('id="game-desc"');
    expect(html).toContain('id="sound-toggle"');
    expect(html).toContain('id="game"');
    expect(html).toContain('id="game-status"');

    // Check for bilingual data
    expect(html).toContain('data-i18n-en="Test Game"');
    expect(html).toContain('data-i18n-pl="Test Game"');
    expect(html).toContain('data-i18n-en="A test game"');
    expect(html).toContain('data-i18n-pl="Gra testowa"');

    // Plain-string keys carry no i18n attributes
    expect(html).toContain('class="legend-keys"');
    expect(html).toContain('<dt>WASD</dt>');
    expect(html).toContain('data-i18n-en="Move"');
    expect(html).toContain('data-i18n-en="Goal"');
    expect(html).toContain('data-i18n-pl="Cel"');

    // Check for hint
    expect(html).toContain('class="hint"');
    expect(html).toContain('data-i18n-en="Press WASD to move"');
  });

  it('handles missing optional fields', () => {
    const manifest = {
      howToPlay: {
        goal: { en: 'Survive', pl: 'Przeżyj' },
        hint: { en: 'Stay alive', pl: 'Zostań przy życiu' },
      },
    };

    const spec = { title: 'Survival Game' };

    const html = generateIndexHtml(manifest, spec);

    // Should not throw and should contain basic elements
    expect(html).toContain('id="game-title"');
    expect(html).toContain('class="legend-keys"');
    expect(html).toContain('data-i18n-en="Goal"');
  });

  it('handles HTML escaping in strings', () => {
    const manifest = {
      howToPlay: {
        goal: { en: 'Find the key & open the door', pl: 'Znaleź klucz & otwórz drzwi' },
        hint: { en: 'Use <arrow> keys', pl: 'Użyj klawiszy <strzałka>' },
      },
    };

    const spec = { title: 'Door < Escape >' };

    const html = generateIndexHtml(manifest, spec);

    // Check that HTML is escaped
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<arrow>');
  });

  it('uses custom canvas dimensions', () => {
    const manifest = {
      canvas: { width: 800, height: 600 },
      howToPlay: {
        goal: { en: 'Test', pl: 'Test' },
        hint: { en: 'Test', pl: 'Test' },
      },
    };

    const spec = { title: 'Game' };

    const html = generateIndexHtml(manifest, spec);

    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
  });

  it('defaults to 640x400 canvas', () => {
    const manifest = {
      howToPlay: {
        goal: { en: 'Test', pl: 'Test' },
        hint: { en: 'Test', pl: 'Test' },
      },
    };

    const spec = { title: 'Game' };

    const html = generateIndexHtml(manifest, spec);

    expect(html).toContain('width="640"');
    expect(html).toContain('height="400"');
  });

  it('includes fixed legend rows', () => {
    const manifest = {
      howToPlay: {
        controls: [{ keys: 'Up', action: { en: 'Jump', pl: 'Skok' } }],
        goal: { en: 'Reach the top', pl: 'Dotrzyj do góry' },
        hint: { en: 'Press keys to move', pl: 'Naciśnij klawisze aby się poruszać' },
      },
    };

    const spec = { title: 'Platformer' };

    const html = generateIndexHtml(manifest, spec);

    // Monolingual keys stay bare; only Touch differs across languages
    expect(html).toContain('<dt>Up</dt>');
    expect(html).toContain('<dt>M</dt>'); // Sound toggle (fixed)
    expect(html).toContain('<dt>Enter / R</dt>'); // Play again (fixed)
    expect(html).toContain('data-i18n-pl="Dotyk"'); // Touch (fixed, bilingual)
  });

  it('handles bilingual control keys', () => {
    const manifest = {
      howToPlay: {
        controls: [
          {
            keys: { en: 'Touch', pl: 'Dotyk' },
            action: { en: 'Attack', pl: 'Atak' },
          },
        ],
        goal: { en: 'Defeat enemies', pl: 'Pokonaj wrogów' },
        hint: { en: 'Touch screen to attack', pl: 'Dotknij ekranu aby atakować' },
      },
    };

    const spec = { title: 'Action Game' };

    const html = generateIndexHtml(manifest, spec);

    // Bilingual keys should be in attributes
    expect(html).toContain('data-i18n-en="Touch"');
    expect(html).toContain('data-i18n-pl="Dotyk"');
  });

  it('includes scoring and mode rows when present', () => {
    const manifest = {
      howToPlay: {
        goal: { en: 'Score points', pl: 'Zdobądź punkty' },
        scoring: { en: '10 points per item', pl: '10 punktów za przedmiot' },
        mode: { en: 'Timed (60 seconds)', pl: 'Na czas (60 sekund)' },
        hint: { en: 'Collect items fast', pl: 'Zbieraj przedmioty szybko' },
      },
    };

    const spec = { title: 'Puzzle Game' };

    const html = generateIndexHtml(manifest, spec);

    expect(html).toContain('data-i18n-en="Scoring"');
    expect(html).toContain('data-i18n-pl="Punkty"');
    expect(html).toContain('data-i18n-en="Mode:"');
    expect(html).toContain('data-i18n-pl="Tryb:"');
    expect(html).toContain('10 points per item');
  });

  it('falls back to default canvas dimensions when GAME.json carries a non-number', () => {
    const manifest = {
      canvas: { width: '640"><script>alert(1)</script>', height: null },
      howToPlay: { goal: { en: 'Test', pl: 'Test' }, hint: { en: 'Test', pl: 'Test' } },
    };

    const html = generateIndexHtml(manifest, { title: 'Game' });

    expect(html).toContain('width="640"');
    expect(html).toContain('height="400"');
    expect(html).not.toContain('<script>');
  });
});

describe('hasPlayableHowToPlay', () => {
  it('accepts a goal/hint pair of non-empty bilingual strings', () => {
    expect(
      hasPlayableHowToPlay({
        goal: { en: 'Survive', pl: 'Przetrwaj' },
        hint: { en: 'Keep moving', pl: 'Nie zatrzymuj się' },
      }),
    ).toBe(true);
  });

  it('refuses a manifest whose howToPlay is not an object', () => {
    expect(hasPlayableHowToPlay(undefined)).toBe(false);
    expect(hasPlayableHowToPlay(null)).toBe(false);
    expect(hasPlayableHowToPlay('goal: survive')).toBe(false);
  });

  it('refuses goal/hint that are present but not {en, pl} strings', () => {
    // The shape a malformed upload could send: truthy, but not renderable.
    expect(hasPlayableHowToPlay({ goal: true, hint: { en: 'x', pl: 'x' } })).toBe(false);
    expect(hasPlayableHowToPlay({ goal: { en: 'x', pl: 'x' }, hint: 'go' })).toBe(false);
    expect(hasPlayableHowToPlay({ goal: { en: 'x' }, hint: { en: 'x', pl: 'x' } })).toBe(false);
  });

  it('refuses empty-string goal or hint text', () => {
    expect(hasPlayableHowToPlay({ goal: { en: '', pl: '' }, hint: { en: 'x', pl: 'x' } })).toBe(false);
  });
});
