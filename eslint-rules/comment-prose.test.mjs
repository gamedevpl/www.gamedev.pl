import { describe, expect, it } from 'vitest';
import {
  COMMENT_PROSE_MAX_WORDS,
  baselineWordsFor,
  countCommentProseWords,
  findCommentProseViolations,
} from './comment-prose-lib.mjs';

describe('findCommentProseViolations', () => {
  it('allows a short single-line // comment', () => {
    const code = `// No allow-same-origin — sandbox escape.\nconst x = 1;\n`;
    expect(findCommentProseViolations(code)).toEqual([]);
  });

  it('flags a // line over the word cap', () => {
    const words = Array.from({ length: COMMENT_PROSE_MAX_WORDS + 1 }, (_, i) => `w${i}`).join(' ');
    const issues = findCommentProseViolations(`// ${words}\n`);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('long');
  });

  it('flags adjacent full-line // comments as a stack', () => {
    const code = `
      // First line of a paragraph about the system.
      // Second line continues the same explanation.
      const x = 1;
    `;
    const issues = findCommentProseViolations(code);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('stack');
  });

  it('a blank line breaks a stack so two short comments both pass', () => {
    const code = `
      // Session cookie is HttpOnly.

      // CSRF uses the double-submit header.
      const x = 1;
    `;
    expect(findCommentProseViolations(code)).toEqual([]);
  });

  it('flags multi-line block comments', () => {
    const code = `
      /**
       * This module owns the session mint and nothing else.
       * It has no Firestore and no HTTP.
       */
      export const N = 1;
    `;
    const issues = findCommentProseViolations(code);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('block');
  });

  it('flags a short single-line block comment — // only', () => {
    const code = `/** Sandbox: no allow-same-origin. */\nexport const N = 1;\n`;
    const issues = findCommentProseViolations(code);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('block');
  });

  it('flags a long trailing comment', () => {
    const words = Array.from({ length: COMMENT_PROSE_MAX_WORDS + 2 }, (_, i) => `t${i}`).join(' ');
    const issues = findCommentProseViolations(`const x = 1; // ${words}\n`);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('trailing');
  });

  it('does not treat // inside strings or templates as comments', () => {
    expect(findCommentProseViolations(`const url = "https://example.com/path";\n`)).toEqual([]);
    expect(findCommentProseViolations('const s = `line // not a comment`;\n')).toEqual([]);
  });

  it('does not treat line-leading // inside a multi-line template as a comment', () => {
    const code = [
      'const source = `',
      '  // this looks like a full-line comment',
      '  // and so does this second line',
      '`;',
      '',
    ].join('\n');
    expect(findCommentProseViolations(code)).toEqual([]);
  });

  it('still scans // inside ${…} interpolations', () => {
    const words = Array.from({ length: COMMENT_PROSE_MAX_WORDS + 1 }, (_, i) => `w${i}`).join(' ');
    const code = ['const s = `hi ${', `  // ${words}`, '  x', '}`;', ''].join('\n');
    const issues = findCommentProseViolations(code);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('long');
  });

  it('ignores braces inside strings within ${…}', () => {
    const code = 'const s = `a ${"}"} b ${\'}\'} c`;\n';
    expect(findCommentProseViolations(code)).toEqual([]);
  });
});

describe('countCommentProseWords', () => {
  it('sums violation words', () => {
    const source = `
      /**
       * Long block that should count every word here carefully.
       * Second line of the same block adds still more words.
       */
    `;
    expect(countCommentProseWords(source)).toBeGreaterThan(COMMENT_PROSE_MAX_WORDS);
  });
});

describe('baselineWordsFor', () => {
  it('missing file is zero — new files may not ship prose debt', () => {
    expect(baselineWordsFor({ version: 1, maxWords: 12, files: { 'a.ts': 10 } }, 'new.ts')).toBe(0);
  });
});
