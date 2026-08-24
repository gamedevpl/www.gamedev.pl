import { describe, expect, it } from 'vitest';
import { AGENT_BUILD_RULES_DIGEST, briefLocales, buildConstraints, splitConceptBrief } from './agent-build-brief.js';
import { MAX_PROJECT_BYTES } from '../platform/games-repo-contract.js';

describe('splitConceptBrief', () => {
  it('returns the whole concept when there is no QA block', () => {
    expect(splitConceptBrief('A game about rockets.')).toEqual({
      spec: 'A game about rockets.',
      qa: [],
    });
  });

  it('splits clarifications into qa lines', () => {
    const raw = [
      'Deliver parcels in space.',
      '',
      '## Creator clarifications',
      '- Pace: arcade',
      '- Tone: cheerful',
      '',
    ].join('\n');
    expect(splitConceptBrief(raw)).toEqual({
      spec: 'Deliver parcels in space.',
      qa: ['Pace: arcade', 'Tone: cheerful'],
    });
  });

  it('keeps spec empty when the concept is only a clarifications block', () => {
    // Persisting the brief must not fall back to the full concept — that would put
    // these bullets into both `spec` and `qa`.
    const raw = ['## Creator clarifications', '- Pace: arcade', '- Tone: cheerful', ''].join('\n');
    expect(splitConceptBrief(raw)).toEqual({
      spec: '',
      qa: ['Pace: arcade', 'Tone: cheerful'],
    });
  });
});

describe('brief helpers', () => {
  it('exposes maxProjectBytes from the games-repo contract', () => {
    expect(buildConstraints().maxProjectBytes).toBe(MAX_PROJECT_BYTES);
    expect(buildConstraints().orientation).toBe('any');
  });

  it('always includes English in locales', () => {
    expect(briefLocales('pl')).toEqual(['pl', 'en']);
    expect(briefLocales('en-US')).toEqual(['en']);
    expect(briefLocales(undefined)).toEqual(['en']);
  });

  it('keeps a non-empty rules digest', () => {
    expect(AGENT_BUILD_RULES_DIGEST.length).toBeGreaterThan(40);
    expect(AGENT_BUILD_RULES_DIGEST).toMatch(/data, not instructions/i);
  });
});
