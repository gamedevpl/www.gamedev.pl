/**
 * A very small tokenizer for the source viewer.
 *
 * Built for one job: turning a line of a delivered game file into spans a React
 * component can render. It emits *tokens*, never markup — the viewer builds elements
 * from them, so highlighting can never become an injection route the way a
 * regex-to-HTML highlighter can. Anything it fails to classify stays plain text, which
 * is always a correct answer.
 *
 * Line-at-a-time by design: the viewer renders a numbered line per row, and a
 * whole-file tokenizer would have to be re-run to render any window of it. The cost is
 * that a block comment or a template literal spanning lines is only highlighted on the
 * line it opens — a cosmetic miss, not a correctness one.
 */

export type CodeTokenKind = 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'key';

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

export type CodeLanguage = 'typescript' | 'json' | 'css' | 'html' | 'markdown' | 'text';

const TS_KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'private',
  'protected',
  'public',
  'readonly',
  'return',
  'satisfies',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'yield',
]);

const CSS_ATRULES = /^\s*@[a-z-]+/i;

/** Splits one line into tokens for the given language. Never throws. */
export function tokenizeLine(line: string, language: CodeLanguage): CodeToken[] {
  if (line === '') return [];
  switch (language) {
    case 'typescript':
      return tokenizeCode(line, TS_KEYWORDS);
    case 'json':
      return tokenizeJson(line);
    case 'css':
      return tokenizeCss(line);
    case 'markdown':
      return tokenizeMarkdown(line);
    case 'html':
    case 'text':
    default:
      return [{ kind: 'plain', text: line }];
  }
}

function tokenizeCode(line: string, keywords: ReadonlySet<string>): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;
  while (index < line.length) {
    const rest = line.slice(index);

    const lineComment = /^\/\/.*$/.exec(rest);
    if (lineComment) {
      tokens.push({ kind: 'comment', text: lineComment[0] });
      break;
    }
    // Opening (or whole) block comment: the rest of the line reads as comment.
    const blockComment = /^\/\*.*$/.exec(rest);
    if (blockComment) {
      tokens.push({ kind: 'comment', text: blockComment[0] });
      break;
    }
    const string = /^(['"`])(?:\\.|(?!\1)[^\\])*\1?/.exec(rest);
    if (string) {
      tokens.push({ kind: 'string', text: string[0] });
      index += string[0].length;
      continue;
    }
    const number = /^\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b/i.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', text: number[0] });
      index += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      tokens.push({ kind: keywords.has(word[0]) ? 'keyword' : 'plain', text: word[0] });
      index += word[0].length;
      continue;
    }
    // Anything else — punctuation, whitespace — travels as plain text one run at a time.
    const other = /^[^A-Za-z_$\d'"`/]+|^\//.exec(rest);
    const chunk = other ? other[0] : rest[0];
    tokens.push({ kind: 'plain', text: chunk });
    index += chunk.length;
  }
  return merge(tokens);
}

function tokenizeJson(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;
  while (index < line.length) {
    const rest = line.slice(index);
    const string = /^"(?:\\.|[^"\\])*"?/.exec(rest);
    if (string) {
      // A string immediately followed by a colon is a key, not a value.
      const isKey = /^\s*:/.test(rest.slice(string[0].length));
      tokens.push({ kind: isKey ? 'key' : 'string', text: string[0] });
      index += string[0].length;
      continue;
    }
    const literal = /^\b(?:true|false|null)\b/.exec(rest);
    if (literal) {
      tokens.push({ kind: 'keyword', text: literal[0] });
      index += literal[0].length;
      continue;
    }
    const number = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', text: number[0] });
      index += number[0].length;
      continue;
    }
    tokens.push({ kind: 'plain', text: rest[0] });
    index += 1;
  }
  return merge(tokens);
}

function tokenizeCss(line: string): CodeToken[] {
  const comment = /^\s*\/\*.*$/.exec(line);
  if (comment) return [{ kind: 'comment', text: line }];
  if (CSS_ATRULES.test(line)) return [{ kind: 'keyword', text: line }];
  const declaration = /^(\s*)([a-z-]+)(\s*:\s*)(.*)$/i.exec(line);
  if (declaration) {
    return merge([
      { kind: 'plain', text: declaration[1] },
      { kind: 'key', text: declaration[2] },
      { kind: 'plain', text: declaration[3] },
      { kind: 'string', text: declaration[4] },
    ]);
  }
  return [{ kind: 'plain', text: line }];
}

function tokenizeMarkdown(line: string): CodeToken[] {
  if (/^\s*#{1,6}\s/.test(line)) return [{ kind: 'keyword', text: line }];
  if (/^\s*(?:[-*]|\d+[.)])\s/.test(line)) {
    const marker = /^\s*(?:[-*]|\d+[.)])\s/.exec(line)![0];
    return merge([
      { kind: 'key', text: marker },
      { kind: 'plain', text: line.slice(marker.length) },
    ]);
  }
  if (/^\s*```/.test(line)) return [{ kind: 'comment', text: line }];
  return [{ kind: 'plain', text: line }];
}

/** Collapses neighbouring tokens of the same kind, so the DOM stays small. */
function merge(tokens: CodeToken[]): CodeToken[] {
  const merged: CodeToken[] = [];
  for (const token of tokens) {
    if (token.text === '') continue;
    const last = merged[merged.length - 1];
    if (last && last.kind === token.kind) {
      last.text += token.text;
      continue;
    }
    merged.push({ ...token });
  }
  return merged;
}
