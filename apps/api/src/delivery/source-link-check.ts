// Cross-file symbol link check; prefer false negatives.

export type SourceLinkFinding = {
  // Importer path, posix, no leading ./.
  from: string;
  // Resolved delivery path, or null if missing.
  target: string | null;
  // Import specifier as written in source.
  importPath: string;
  // Missing symbol, or null when the module is absent.
  symbol: string | null;
};

const RELATIVE_IMPORT_RE = /^\s*import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"](\.[^'"]+)['"]\s*;?\s*$/gm;
const EXPORT_NAMED_RE =
  /^\s*export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^\s*export\s*\{([^}]+)\}/gm;
const EXPORT_DEFAULT_RE = /^\s*export\s+default\b/m;
const MAX_GROUPED_FINDINGS = 8;
const MAX_ERROR_BYTES = 800;
// Cap bindings scanned per file for pathological sources.
const MAX_IMPORT_BINDINGS_PER_FILE = 40;

// Strip line and block comments before parsing.
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (c === '/' && n === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i + 1 < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1;
      }
      i = Math.min(source.length, i + 2);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < source.length) {
        const ch = source[i];
        out += ch;
        if (ch === '\\') {
          i += 1;
          if (i < source.length) {
            out += source[i];
            i += 1;
          }
          continue;
        }
        if (ch === quote) {
          i += 1;
          break;
        }
        if (quote === '`' && ch === '$' && source[i + 1] === '{') {
          out += '{';
          i += 2;
          let depth = 1;
          while (i < source.length && depth > 0) {
            const t = source[i];
            out += t;
            if (t === '{') depth += 1;
            else if (t === '}') depth -= 1;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

type NamedBinding = { imported: string };

type ParsedImport = {
  names: NamedBinding[];
  hasDefault: boolean;
  // Namespace import — skip symbol checks.
  isNamespace: boolean;
  // Type-only import — skip (prefer false negative).
  isTypeOnly: boolean;
  path: string;
};

function parseNamedBindings(clause: string): NamedBinding[] {
  const out: NamedBinding[] = [];
  for (const part of clause.split(',')) {
    const bit = part.trim();
    if (!bit) continue;
    // Skip inline type bindings (false-negative ok).
    if (/^type\b/.test(bit)) continue;
    const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(bit);
    if (asMatch) {
      out.push({ imported: asMatch[1]! });
      continue;
    }
    if (/^[A-Za-z_$][\w$]*$/.test(bit)) {
      out.push({ imported: bit });
    }
  }
  return out;
}

// Parse relative ESM import statements from source.
export function parseRelativeImports(source: string): ParsedImport[] {
  const text = stripComments(source);
  const out: ParsedImport[] = [];
  RELATIVE_IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RELATIVE_IMPORT_RE.exec(text)) !== null) {
    const rawClause = m[1]!.trim();
    const path = m[2]!;
    const isTypeOnly = /^\s*import\s+type\b/.test(m[0]!);
    if (rawClause.startsWith('*')) {
      out.push({
        names: [],
        hasDefault: false,
        isNamespace: true,
        isTypeOnly,
        path,
      });
      continue;
    }
    let hasDefault = false;
    let names: NamedBinding[] = [];
    const brace = rawClause.indexOf('{');
    if (brace === -1) {
      if (/^[A-Za-z_$][\w$]*$/.test(rawClause)) {
        hasDefault = true;
      } else {
        continue;
      }
    } else {
      const before = rawClause.slice(0, brace).trim().replace(/,$/, '').trim();
      if (before && /^[A-Za-z_$][\w$]*$/.test(before)) {
        hasDefault = true;
      }
      const end = rawClause.lastIndexOf('}');
      if (end > brace) {
        names = parseNamedBindings(rawClause.slice(brace + 1, end));
      }
    }
    out.push({ names, hasDefault, isNamespace: false, isTypeOnly, path });
  }
  return out;
}

type ExportInfo = {
  named: Set<string>;
  hasDefault: boolean;
  // Opaque barrel — skip symbol checks on importers.
  reexportsAll: boolean;
};

// Collect export names from a module source.
export function collectExports(source: string): ExportInfo {
  const text = stripComments(source);
  const named = new Set<string>();
  let hasDefault = EXPORT_DEFAULT_RE.test(text);
  const reexportsAll = /^\s*export\s*\*\s+(?:as\s+[A-Za-z_$][\w$]*\s+)?from\s+/m.test(text);

  EXPORT_NAMED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPORT_NAMED_RE.exec(text)) !== null) {
    named.add(m[1]!);
  }

  EXPORT_LIST_RE.lastIndex = 0;
  while ((m = EXPORT_LIST_RE.exec(text)) !== null) {
    for (const part of m[1]!.split(',')) {
      const bit = part.trim().replace(/^type\s+/, '');
      if (!bit) continue;
      const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(bit);
      if (asMatch) {
        // Importers see the exported name, not local.
        named.add(asMatch[2]!);
        continue;
      }
      if (/^[A-Za-z_$][\w$]*$/.test(bit)) named.add(bit);
    }
  }

  if (named.has('default')) hasDefault = true;

  return { named, hasDefault, reexportsAll };
}

function dirnamePosix(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function joinPosix(dir: string, rel: string): string {
  const base = dir ? dir.split('/') : [];
  for (const part of rel.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (base.length === 0) return '';
      base.pop();
      continue;
    }
    base.push(part);
  }
  return base.join('/');
}

// Resolve a relative import against delivery keys.
export function resolveRelativeImport(
  fromPath: string,
  importPath: string,
  files: ReadonlyMap<string, string>,
): string | null {
  if (!importPath.startsWith('./') && !importPath.startsWith('../')) return null;
  const joined = joinPosix(dirnamePosix(fromPath), importPath);
  if (!joined) return null;
  if (files.has(joined)) return joined;
  if (joined.endsWith('.js')) {
    const ts = joined.slice(0, -3) + '.ts';
    if (files.has(ts)) return ts;
    const tsx = joined.slice(0, -3) + '.tsx';
    if (files.has(tsx)) return tsx;
  }
  if (joined.endsWith('.ts') || joined.endsWith('.tsx')) {
    const js = joined.replace(/\.tsx?$/, '.js');
    if (files.has(js)) return js;
  }
  if (!/\.[a-zA-Z0-9]+$/.test(joined)) {
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js']) {
      const candidate = joined + ext;
      if (files.has(candidate)) return candidate;
    }
  }
  return null;
}

function isCheckableSourcePath(path: string): boolean {
  return /\.(?:[cm]?[jt]s|tsx|jsx)$/.test(path);
}

// Find unresolved relative imports across a source map.
export function findUnresolvedSourceLinks(files: ReadonlyMap<string, string>): SourceLinkFinding[] {
  const findings: SourceLinkFinding[] = [];
  const exportCache = new Map<string, ExportInfo>();

  const sortedPaths = [...files.keys()].filter(isCheckableSourcePath).sort();
  for (const from of sortedPaths) {
    const source = files.get(from);
    if (source == null) continue;
    let imports: ParsedImport[];
    try {
      imports = parseRelativeImports(source);
    } catch {
      continue;
    }
    let bindingBudget = MAX_IMPORT_BINDINGS_PER_FILE;
    for (const imp of imports) {
      if (imp.isTypeOnly || imp.isNamespace) continue;
      const resolved = resolveRelativeImport(from, imp.path, files);
      if (resolved == null) {
        if (/\.(?:[cm]?[jt]s|tsx|jsx)$/.test(imp.path) || !/\.[a-zA-Z0-9]+$/.test(imp.path)) {
          findings.push({ from, target: null, importPath: imp.path, symbol: null });
        }
        continue;
      }
      let exports = exportCache.get(resolved);
      if (!exports) {
        try {
          exports = collectExports(files.get(resolved) ?? '');
        } catch {
          continue;
        }
        exportCache.set(resolved, exports);
      }
      // Opaque export-* barrel: skip symbol checks.
      if (exports.reexportsAll) continue;

      if (imp.hasDefault) {
        bindingBudget -= 1;
        if (bindingBudget < 0) break;
        if (!exports.hasDefault && !exports.named.has('default')) {
          findings.push({
            from,
            target: resolved,
            importPath: imp.path,
            symbol: 'default',
          });
        }
      }
      for (const binding of imp.names) {
        bindingBudget -= 1;
        if (bindingBudget < 0) break;
        if (!exports.named.has(binding.imported)) {
          findings.push({
            from,
            target: resolved,
            importPath: imp.path,
            symbol: binding.imported,
          });
        }
      }
    }
  }
  return findings;
}

type GroupedFinding = {
  targetLabel: string;
  symbols: string[];
  importers: string[];
  missingModule: boolean;
};

function groupFindings(findings: SourceLinkFinding[]): GroupedFinding[] {
  const byKey = new Map<string, GroupedFinding>();
  for (const f of findings) {
    const targetLabel = f.target ?? f.importPath;
    const key = f.symbol == null ? `missing:${targetLabel}` : `syms:${targetLabel}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        targetLabel,
        symbols: [],
        importers: [],
        missingModule: f.symbol == null,
      };
      byKey.set(key, group);
    }
    if (f.symbol != null && !group.symbols.includes(f.symbol)) {
      group.symbols.push(f.symbol);
    }
    if (!group.importers.includes(f.from)) {
      group.importers.push(f.from);
    }
  }
  // Most missing symbols first, then importer count.
  return [...byKey.values()].sort((a, b) => {
    const sa = a.missingModule ? 0 : a.symbols.length;
    const sb = b.missingModule ? 0 : b.symbols.length;
    if (sb !== sa) return sb - sa;
    return b.importers.length - a.importers.length;
  });
}

function formatGroup(g: GroupedFinding): string {
  const importers = g.importers.join(', ');
  if (g.missingModule) {
    return (
      `${g.targetLabel} is missing from the delivery — imported by ${importers}. ` +
      'Add the file or change the import; both paths are yours to edit.'
    );
  }
  const syms = g.symbols.map((s) => `\`${s}\``).join(', ');
  return (
    `${g.targetLabel} does not export ${syms} — imported by ${importers}. ` +
    'Add the exports or change the imports; both files are yours to edit.'
  );
}

// Group findings; cap groups and total message bytes.
export function formatSourceLinkError(findings: SourceLinkFinding[]): string {
  if (findings.length === 0) return '';
  const groups = groupFindings(findings);
  let shownCount = Math.min(groups.length, MAX_GROUPED_FINDINGS);

  const build = (count: number): string => {
    const shown = groups.slice(0, count);
    const suppressed = groups.length - shown.length;
    const header = 'Source link check failed — fix missing imports/exports before submitting:\n';
    let body = header + shown.map(formatGroup).join('\n');
    if (suppressed > 0) {
      body += `\n(${suppressed} more target file${suppressed === 1 ? '' : 's'} suppressed)`;
    }
    return body;
  };

  let body = build(shownCount);
  while (body.length > MAX_ERROR_BYTES && shownCount > 1) {
    shownCount -= 1;
    body = build(shownCount);
  }
  if (body.length > MAX_ERROR_BYTES) {
    body = body.slice(0, MAX_ERROR_BYTES - 1) + '…';
  }
  return body;
}

// Build a path→content map from delivery files.
export function sourceFilesToMap(files: ReadonlyArray<{ path: string; content: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    map.set(file.path.trim(), file.content);
  }
  return map;
}
