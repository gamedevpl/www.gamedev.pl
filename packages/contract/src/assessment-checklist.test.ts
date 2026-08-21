import { describe, expect, it } from 'vitest';
import { ASSESSMENT_CHECKLIST_KEYS } from './assessment-checklist.js';

describe('ASSESSMENT_CHECKLIST_KEYS', () => {
  it('lists the five facets the API and web both derive', () => {
    expect(ASSESSMENT_CHECKLIST_KEYS).toEqual(['graphics', 'gameplay', 'fun', 'sound', 'controls']);
  });
});
