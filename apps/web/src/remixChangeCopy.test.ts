import { describe, expect, it } from 'vitest';
import { composeRemixOutcome, describeParamChanges } from './remixChangeCopy.js';
import type { EditorParamSpec } from './studioApi.js';

const specs: Record<string, EditorParamSpec> = {
  speed: { type: 'number', min: 1, max: 3, default: 1, label: { en: 'Speed', pl: 'Prędkość' } },
};

describe('remixChangeCopy', () => {
  it('lists only values that moved, using the locale label', () => {
    expect(describeParamChanges(specs, { speed: 1 }, { speed: 2 }, 'en')).toEqual(['Speed: 1 → 2']);
    expect(describeParamChanges(specs, { speed: 1 }, { speed: 2 }, 'pl')).toEqual(['Prędkość: 1 → 2']);
    expect(describeParamChanges(specs, { speed: 1 }, { speed: 1 }, 'en')).toEqual([]);
  });

  it('appends change lines under the summary', () => {
    expect(composeRemixOutcome('Bigger.', ['Speed: 1 → 2'])).toBe('Bigger.\nSpeed: 1 → 2');
    expect(composeRemixOutcome('Done.', [])).toBe('Done.');
  });
});
