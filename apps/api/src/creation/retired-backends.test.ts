import { describe, expect, it } from 'vitest';
import { isRetiredBackend } from './retired-backends.js';

describe('isRetiredBackend', () => {
  it.each(['managed:copilot', 'copilot'])('treats %s as retired', (name) => {
    expect(isRetiredBackend(name)).toBe(true);
  });

  it.each([undefined, 'self', 'managed:anthropic', 'managed:gemini', 'managed:openai', 'copilot-ish'])(
    'keeps %s live',
    (name) => {
      expect(isRetiredBackend(name)).toBe(false);
    },
  );
});
