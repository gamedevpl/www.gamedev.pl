import { describe, expect, it } from 'vitest';
import { SLASH_VERBS } from './argv.js';
import { formatHelp } from './help.js';

describe('formatHelp', () => {
  it('describes every verb instead of a pipe list', () => {
    const out = formatHelp();
    expect(out).not.toMatch(/gamedevpl <[a-z]+\|/);
    expect(out).toContain('open a browser and sign in');
    expect(out).toContain('interactive REPL');
    expect(out).toMatch(/submit\s+run the local gate, no upload/);
    for (const verb of SLASH_VERBS) {
      expect(out).toMatch(new RegExp(`^  ${verb}\\s+\\S`, 'm'));
    }
  });

  it('prefixes slash verbs for the REPL', () => {
    const out = formatHelp(true);
    expect(out).toContain('/login');
    expect(out).toContain('a game starts when you ask');
    expect(out).toContain('/quit');
  });
});
