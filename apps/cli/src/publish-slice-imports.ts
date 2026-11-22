type Token = { kind: 'id' | 'str' | 'punct' | 'other'; value: string };

const REGEX_PREV_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'in',
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
  if (prev.kind === 'id') return REGEX_PREV_KEYWORDS.has(prev.value);
  if (prev.kind === 'punct') return !')]}'.includes(prev.value);
  return false;
}

function tokenizeModule(source: string): Token[] {
  const tokens: Token[] = [];
  const tplBraceDepths: number[] = [];
  let braceDepth = 0;
  let i = 0;

  const readTemplateChunk = (): void => {
    while (i < source.length) {
      const ch = source[i]!;
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        i += 1;
        tokens.push({ kind: 'other', value: '`' });
        return;
      }
      if (ch === '$' && source[i + 1] === '{') {
        i += 2;
        tokens.push({ kind: 'other', value: '${' });
        braceDepth += 1;
        tplBraceDepths.push(braceDepth);
        return;
      }
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
      readTemplateChunk();
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
    if (ch === '{') {
      braceDepth += 1;
      tokens.push({ kind: 'punct', value: ch });
      i += 1;
      continue;
    }
    if (ch === '}') {
      if (tplBraceDepths.length > 0 && tplBraceDepths[tplBraceDepths.length - 1] === braceDepth) {
        tplBraceDepths.pop();
        braceDepth -= 1;
        i += 1;
        readTemplateChunk();
        continue;
      }
      braceDepth = Math.max(0, braceDepth - 1);
      tokens.push({ kind: 'punct', value: ch });
      i += 1;
      continue;
    }
    tokens.push({ kind: 'punct', value: ch });
    i += 1;
  }
  return tokens;
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

    if (tok.value === 'import' && next.kind === 'punct' && next.value === '(') {
      const arg = tokens[i + 2];
      const after = tokens[i + 3];
      if (arg?.kind === 'str' && arg.value.startsWith('.') && after?.kind === 'punct' && ',)'.includes(after.value)) {
        found.push(arg.value);
      }
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
        if (cur.kind === 'punct' && ';=('.includes(cur.value)) break;
        if (cur.kind === 'id' && CLAUSE_STOP_IDS.has(cur.value)) break;
      }
      j += 1;
    }
  }
  return found;
}
