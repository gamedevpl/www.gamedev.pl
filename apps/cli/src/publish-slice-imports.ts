import { CliError, EXIT_REFUSED } from './exit-codes.js';

type Token = { kind: 'id' | 'str' | 'tpl' | 'punct' | 'other'; value: string; regexAfter?: boolean };

const REGEX_PREV_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'default',
  'in',
  'instanceof',
  'of',
  'typeof',
  'void',
  'delete',
  'new',
  'yield',
  'await',
  'else',
  'do',
]);
const CONTROL_PAREN_KEYWORDS = new Set(['if', 'while', 'for', 'with']);
const BLOCK_PREV_KEYWORDS = new Set(['else', 'try', 'finally', 'do']);
const CLAUSE_STOP_IDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'class',
  'interface',
  'enum',
  'default',
  'async',
  'abstract',
  'declare',
  'namespace',
]);

function allowsRegex(prev: Token | undefined): boolean {
  if (!prev) return true;
  if (prev.regexAfter !== undefined) return prev.regexAfter;
  if (prev.kind === 'id') return REGEX_PREV_KEYWORDS.has(prev.value);
  if (prev.kind === 'punct') return !')]}'.includes(prev.value);
  return false;
}

function isBlockBrace(prev: Token | undefined): boolean {
  if (!prev) return true;
  if (prev.kind === 'id') return BLOCK_PREV_KEYWORDS.has(prev.value);
  if (prev.kind === 'punct')
    return prev.value === ';' || prev.value === '{' || prev.value === '}' || prev.value === ')' || prev.value === '=>';
  return false;
}

function tokenizeModule(source: string): Token[] {
  const tokens: Token[] = [];
  const tplBraceDepths: number[] = [];
  const parenStack: boolean[] = [];
  const braceStack: boolean[] = [];
  let braceDepth = 0;
  let i = 0;

  const readTemplateChunk = (start: boolean): void => {
    let val = '';
    while (i < source.length) {
      const ch = source[i]!;
      if (ch === '\\') {
        if (start && i + 1 < source.length) val += source[i + 1]!;
        i += 2;
        continue;
      }
      if (ch === '`') {
        i += 1;
        tokens.push(start ? { kind: 'tpl', value: val } : { kind: 'other', value: '`' });
        return;
      }
      if (ch === '$' && source[i + 1] === '{') {
        i += 2;
        tokens.push({ kind: 'other', value: '${' });
        braceDepth += 1;
        tplBraceDepths.push(braceDepth);
        return;
      }
      if (start) val += ch;
      i += 1;
    }
  };

  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1] ?? '';
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      let val = '';
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) {
          val += source[i + 1]!;
          i += 2;
        } else {
          val += source[i]!;
          i += 1;
        }
      }
      i += 1;
      tokens.push({ kind: 'str', value: val });
      continue;
    }
    if (ch === '`') {
      i += 1;
      readTemplateChunk(true);
      continue;
    }
    if (ch === '/' && allowsRegex(tokens[tokens.length - 1])) {
      i += 1;
      let inClass = false;
      while (i < source.length) {
        const c = source[i]!;
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          i += 1;
          while (i < source.length && /[a-z]/i.test(source[i]!)) i += 1;
          break;
        } else if (c === '\n') break;
        i += 1;
      }
      tokens.push({ kind: 'other', value: '/' });
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let end = i + 1;
      while (end < source.length && /[A-Za-z0-9_$]/.test(source[end]!)) end += 1;
      tokens.push({ kind: 'id', value: source.slice(i, end) });
      i = end;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let end = i + 1;
      while (end < source.length && /[0-9a-zA-Z._]/.test(source[end]!)) end += 1;
      tokens.push({ kind: 'other', value: source.slice(i, end) });
      i = end;
      continue;
    }
    if (ch === '=' && next === '>') {
      tokens.push({ kind: 'punct', value: '=>' });
      i += 2;
      continue;
    }
    if (ch === '(') {
      const prev = tokens[tokens.length - 1];
      parenStack.push(prev?.kind === 'id' && CONTROL_PAREN_KEYWORDS.has(prev.value));
      tokens.push({ kind: 'punct', value: ch });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'punct', value: ch, regexAfter: parenStack.pop() ?? false });
      i += 1;
      continue;
    }
    if (ch === '{') {
      braceDepth += 1;
      braceStack.push(isBlockBrace(tokens[tokens.length - 1]));
      tokens.push({ kind: 'punct', value: ch });
      i += 1;
      continue;
    }
    if (ch === '}') {
      if (tplBraceDepths.length > 0 && tplBraceDepths[tplBraceDepths.length - 1] === braceDepth) {
        tplBraceDepths.pop();
        braceDepth -= 1;
        i += 1;
        readTemplateChunk(false);
        continue;
      }
      braceDepth = Math.max(0, braceDepth - 1);
      tokens.push({ kind: 'punct', value: ch, regexAfter: braceStack.pop() ?? true });
      i += 1;
      continue;
    }
    tokens.push({ kind: 'punct', value: ch });
    i += 1;
  }
  return tokens;
}

function resolveConstantImportArg(tokens: Token[], openParen: number): { specifier: string | null; end: number } {
  let depth = 0;
  let end = openParen;
  let firstArgEnd = -1;
  for (let k = openParen; k < tokens.length; k += 1) {
    const t = tokens[k]!;
    if (t.kind === 'punct' && t.value === '(') depth += 1;
    else if (t.kind === 'punct' && t.value === ')') {
      depth -= 1;
      if (depth === 0) {
        end = k;
        if (firstArgEnd === -1) firstArgEnd = k;
        break;
      }
    } else if (depth === 1 && t.kind === 'punct' && t.value === ',' && firstArgEnd === -1) {
      firstArgEnd = k;
    }
  }
  if (firstArgEnd === -1 || firstArgEnd <= openParen + 1) return { specifier: null, end };
  const argTokens = tokens.slice(openParen + 1, firstArgEnd);
  const afterClose = tokens[end + 1];
  const looksLikeMethod =
    (afterClose?.kind === 'punct' && afterClose.value === '{') ||
    argTokens.some((t) => t.kind === 'punct' && t.value === ':');
  if (looksLikeMethod) return { specifier: null, end };

  let combined = '';
  let expectValue = true;
  let parenBalance = 0;
  let valid = true;
  for (const t of argTokens) {
    if (t.kind === 'punct' && t.value === '(') {
      if (!expectValue) {
        valid = false;
        break;
      }
      parenBalance += 1;
    } else if (t.kind === 'punct' && t.value === ')') {
      if (expectValue || parenBalance === 0) {
        valid = false;
        break;
      }
      parenBalance -= 1;
    } else if (expectValue && (t.kind === 'str' || t.kind === 'tpl')) {
      combined += t.value;
      expectValue = false;
    } else if (!expectValue && t.kind === 'punct' && t.value === '+') {
      expectValue = true;
    } else {
      valid = false;
      break;
    }
  }
  if (!valid || expectValue || parenBalance !== 0) {
    throw new CliError('Dynamic import(...) in --entry slice must use a constant string expression.', EXIT_REFUSED);
  }
  return { specifier: combined.startsWith('.') ? combined : null, end };
}

export function extractRelativeSpecifiers(source: string): string[] {
  const tokens = tokenizeModule(source);
  const found: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i]!;
    if (tok.kind !== 'id' || (tok.value !== 'import' && tok.value !== 'export')) continue;
    const prev = tokens[i - 1];
    if (prev?.kind === 'punct' && prev.value === '.') continue;
    const next = tokens[i + 1];
    if (!next) continue;

    if (tok.value === 'import' && next.kind === 'punct' && next.value === '.') continue;
    if (tok.value === 'import' && next.kind === 'punct' && next.value === '(') {
      const { specifier, end } = resolveConstantImportArg(tokens, i + 1);
      if (specifier) found.push(specifier);
      i = end;
      continue;
    }
    if (tok.value === 'import' && next.kind === 'str') {
      if (next.value.startsWith('.')) found.push(next.value);
      continue;
    }

    let j = i + 1;
    let inBraces = false;
    while (j < tokens.length) {
      const cur = tokens[j]!;
      if (cur.kind === 'punct' && cur.value === '{') {
        inBraces = true;
      } else if (cur.kind === 'punct' && cur.value === '}') {
        const afterBrace = tokens[j + 1];
        const target = tokens[j + 2];
        if (
          afterBrace?.kind === 'id' &&
          afterBrace.value === 'from' &&
          target?.kind === 'str' &&
          target.value.startsWith('.')
        ) {
          found.push(target.value);
          i = j + 2;
        }
        break;
      } else if (!inBraces) {
        if (cur.kind === 'id' && cur.value === 'from') {
          const target = tokens[j + 1];
          if (target?.kind === 'str' && target.value.startsWith('.')) found.push(target.value);
          i = j + 1;
          break;
        }
        if (cur.kind === 'punct' && ';=():?[]'.includes(cur.value)) break;
        if (cur.kind === 'id' && CLAUSE_STOP_IDS.has(cur.value)) break;
      }
      j += 1;
    }
  }
  return found;
}
