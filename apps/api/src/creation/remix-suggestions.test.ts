import { describe, expect, it } from 'vitest';
import { buildSuggestions } from './remix-suggestions.js';
import type { EditorDefinition } from './editor-contract.js';

/*
 * The rule these pin: a suggestion is derived, never invented. Offering a line
 * the game cannot act on is worse than offering nothing — it is a promise the
 * next screen breaks, on the one line a player is most likely to imitate.
 */

const definition = (params: Record<string, unknown>): EditorDefinition =>
  ({ version: 1, params, content: {} }) as unknown as EditorDefinition;

describe('buildSuggestions', () => {
  it('turns declared parameters into lines the game can satisfy', () => {
    const out = buildSuggestions(
      definition({
        speed: { type: 'number', min: 1, max: 9, default: 3, label: { en: 'speed', pl: 'szybkość' } },
        rain: { type: 'bool', default: false, label: { en: 'rain', pl: 'deszcz' } },
      }),
      { canAssist: true, canCode: false },
    );
    expect(out).toEqual([
      { kind: 'param', key: 'speed', direction: 'more' },
      // Toward the change: offering the state it is already in suggests nothing.
      { kind: 'param', key: 'rain', direction: 'on' },
    ]);
  });

  it('offers a declared toggle the way it is not currently set', () => {
    const out = buildSuggestions(definition({ rain: { type: 'bool', default: true, label: { en: 'rain' } } }), {
      canAssist: true,
      canCode: false,
    });
    expect(out).toEqual([{ kind: 'param', key: 'rain', direction: 'off' }]);
  });

  it('skips text and enum, which cannot be suggested without guessing a value', () => {
    const out = buildSuggestions(
      definition({
        tagline: { type: 'text', max: 20, default: 'go', label: { en: 'tagline' } },
        theme: { type: 'enum', values: ['day', 'night'], default: 'day', label: { en: 'theme' } },
      }),
      { canAssist: true, canCode: false },
    );
    expect(out).toEqual([]);
  });

  it('tops up with starters only when a rebuild can actually satisfy them', () => {
    const params = definition({ speed: { type: 'number', min: 1, max: 9, default: 3, label: { en: 'speed' } } });
    expect(buildSuggestions(params, { canAssist: true, canCode: false })).toHaveLength(1);

    const withCode = buildSuggestions(params, { canAssist: true, canCode: true });
    expect(withCode).toHaveLength(3);
    expect(withCode.slice(1)).toEqual([
      { kind: 'starter', id: 'faster' },
      { kind: 'starter', id: 'look' },
    ]);
  });

  it('offers nothing at all when no lane can answer', () => {
    // The panel says so in words instead; a suggestion here would be an offer
    // the very next tap has to withdraw.
    expect(buildSuggestions(null, { canAssist: false, canCode: false })).toEqual([]);
  });
});
