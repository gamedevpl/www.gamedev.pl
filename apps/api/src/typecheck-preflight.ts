// In-process tsc preflight for submit_sources.

import path from 'node:path';
import ts from 'typescript';
import type { KitTree } from './agent-surface/kit-files.js';
import { KIT_ROOT_DIR } from './agent-surface/kit-registry.js';

const COMPILER_OPTIONS: ts.CompilerOptions = {
  noEmit: true,
  strict: true,
  // Game code only, and stricter than the games repo's `tsconfig.json` on purpose: its
  // `npm run typecheck` compiles `games/` under this flag too (it just cannot say so
  // per-directory, with GameKit's own debt in the same tree). An unannotated parameter is
  // an `any` with nothing to grep for, so Check 37's ban would be a formality without it.
  noImplicitAny: true,
  strictPropertyInitialization: false,
  useUnknownInCatchVariables: false,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
};

const ROOT = '/preflight';
const MAX_GROUPED = 8;
const MAX_ERROR_BYTES = 800;
// Soft wall, over budget skips. Raised from 10s: hit 12.9s once.
export const TYPECHECK_PREFLIGHT_BUDGET_MS = 20_000;
// Cap refusals; further submits accept.
export const TYPECHECK_PREFLIGHT_MAX_REFUSALS = 2;

const libCache = new Map<string, ts.SourceFile | undefined>();
const TS_LIB_DIR = path.dirname(ts.getDefaultLibFilePath(COMPILER_OPTIONS));

function isAllowedDiskPath(name: string): boolean {
  const resolved = path.resolve(name);
  return resolved === TS_LIB_DIR || resolved.startsWith(`${TS_LIB_DIR}${path.sep}`);
}

export type TypecheckPreflightResult =
  | { ok: true; skipped?: 'no_kit' | 'timeout' | 'checker_failed'; durationMs: number }
  | { ok: false; message: string; durationMs: number };

export function sharedSourcesFromKitTree(tree: KitTree): Record<string, string> {
  const out: Record<string, string> = {};
  const prefix = `${KIT_ROOT_DIR}/`;
  for (const [filePath, buf] of tree.files) {
    if (!filePath.startsWith(prefix)) continue;
    const rel = filePath.slice(prefix.length);
    const isKitDts = rel === 'shared/game-kit.d.ts';
    const isModule = rel.startsWith('shared/modules/') && rel.endsWith('.ts');
    const isVertical = rel.startsWith('shared/verticals/') && rel.endsWith('.ts');
    const isSharedSim = rel.startsWith('shared/sim/') && rel.endsWith('.ts');
    if (isKitDts || isModule || isVertical || isSharedSim) {
      out[rel] = buf.toString('utf8');
    }
  }
  return out;
}

function gameRelativePath(virtualPath: string, slug: string): string {
  const prefix = `${ROOT}/games/${slug}/`;
  return virtualPath.startsWith(prefix) ? virtualPath.slice(prefix.length) : virtualPath;
}

type RawFinding = {
  file: string;
  code: number;
  message: string;
  property?: string;
  typeName?: string;
};

function parseMissingProperty(message: string): { property: string; typeName: string } | null {
  const m = /Property '([^']+)' does not exist on type '([^']+)'/.exec(message);
  if (!m) return null;
  return { property: m[1]!, typeName: m[2]! };
}

function collectFindings(diagnostics: readonly ts.Diagnostic[], slug: string): RawFinding[] {
  const gamePrefix = `${ROOT}/games/${slug}/`;
  const out: RawFinding[] = [];
  for (const diagnostic of diagnostics) {
    if (!diagnostic.file?.fileName.startsWith(gamePrefix)) continue;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    const file = gameRelativePath(diagnostic.file.fileName, slug);
    const missing = diagnostic.code === 2339 ? parseMissingProperty(message) : null;
    out.push({
      file,
      code: diagnostic.code,
      message,
      ...(missing ? { property: missing.property, typeName: missing.typeName } : {}),
    });
  }
  return out;
}

function formatFindings(findings: RawFinding[]): string {
  if (findings.length === 0) return '';

  const groups = new Map<
    string,
    { kind: 'props' | 'other'; file: string; typeName?: string; props: string[]; line: string }
  >();
  for (const f of findings) {
    if (f.property && f.typeName) {
      const key = `props:${f.file}:${f.typeName}`;
      let g = groups.get(key);
      if (!g) {
        g = { kind: 'props', file: f.file, typeName: f.typeName, props: [], line: '' };
        groups.set(key, g);
      }
      if (!g.props.includes(f.property)) g.props.push(f.property);
      continue;
    }
    const key = `other:${f.file}:${f.code}:${f.message}`;
    if (!groups.has(key)) {
      groups.set(key, {
        kind: 'other',
        file: f.file,
        props: [],
        line: `${f.file}: error TS${f.code}: ${f.message}`,
      });
    }
  }

  const lines: string[] = [];
  for (const g of groups.values()) {
    if (g.kind === 'props') {
      const listed = g.props.map((p) => `\`${p}\``).join(', ');
      const noun = g.props.length === 1 ? 'property' : 'properties';
      lines.push(
        `${g.file}: type \`${g.typeName}\` has no ${noun} ${listed}. ` + 'Add them to the type or stop reading them.',
      );
    } else {
      lines.push(g.line);
    }
  }

  lines.sort((a, b) => b.length - a.length);
  let shown = lines.slice(0, MAX_GROUPED);
  let suppressed = lines.length - shown.length;
  const header = 'Typecheck preflight failed — fix these before submitting:\n';
  const footer = (n: number) => (n > 0 ? `\n(${n} more finding${n === 1 ? '' : 's'} suppressed)` : '');

  let body = header + shown.join('\n') + footer(suppressed);
  while (body.length > MAX_ERROR_BYTES && shown.length > 1) {
    shown = shown.slice(0, -1);
    suppressed = lines.length - shown.length;
    body = header + shown.join('\n') + footer(suppressed);
  }
  if (body.length > MAX_ERROR_BYTES) {
    body = body.slice(0, MAX_ERROR_BYTES - 1) + '…';
  }
  return body;
}

export function typecheckDeliverySources(input: {
  slug: string;
  sources: Record<string, string>;
  kitShared: Record<string, string>;
}): TypecheckPreflightResult {
  const started = Date.now();
  if (!input.kitShared['shared/game-kit.d.ts']) {
    return { ok: true, skipped: 'no_kit', durationMs: Date.now() - started };
  }

  const files = new Map<string, string>();
  for (const [rel, source] of Object.entries(input.kitShared)) {
    files.set(`${ROOT}/${rel}`, source);
  }
  const gameRoot = `${ROOT}/games/${input.slug}`;
  for (const [rel, source] of Object.entries(input.sources)) {
    if (rel.endsWith('.ts') || rel.endsWith('.tsx')) {
      files.set(`${gameRoot}/${rel}`, source);
    }
  }
  const roots = [...files.keys()];

  // Disk reads: TypeScript lib only (delivery is untrusted).
  const host: ts.CompilerHost = {
    fileExists: (name) => files.has(name) || (isAllowedDiskPath(name) && ts.sys.fileExists(name)),
    readFile: (name) => {
      const own = files.get(name);
      if (own !== undefined) return own;
      if (!isAllowedDiskPath(name)) return undefined;
      return ts.sys.readFile(name);
    },
    getSourceFile: (name, languageVersion) => {
      const own = files.get(name);
      if (own !== undefined) return ts.createSourceFile(name, own, languageVersion, true);
      if (libCache.has(name)) return libCache.get(name);
      if (!isAllowedDiskPath(name)) {
        libCache.set(name, undefined);
        return undefined;
      }
      const text = ts.sys.readFile(name);
      const parsed = text === undefined ? undefined : ts.createSourceFile(name, text, languageVersion, true);
      libCache.set(name, parsed);
      return parsed;
    },
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    writeFile: () => undefined,
    getCurrentDirectory: () => ROOT,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    directoryExists: (dir) => dir.startsWith(ROOT) || (isAllowedDiskPath(dir) && ts.sys.directoryExists(dir)),
    getDirectories: (dir) => (isAllowedDiskPath(dir) ? ts.sys.getDirectories(dir) : []),
  };

  let program: ts.Program;
  try {
    program = ts.createProgram(roots, COMPILER_OPTIONS, host);
  } catch {
    return { ok: true, skipped: 'checker_failed', durationMs: Date.now() - started };
  }

  const diagnostics = [...program.getSemanticDiagnostics(), ...program.getSyntacticDiagnostics()];
  const findings = collectFindings(diagnostics, input.slug);
  const durationMs = Date.now() - started;
  if (findings.length === 0) return { ok: true, durationMs };
  return { ok: false, message: formatFindings(findings), durationMs };
}

// Post-check budget: sync tsc cannot be preempted mid-run.
export async function runTypecheckPreflight(input: {
  slug: string;
  sources: Record<string, string>;
  kitShared: Record<string, string>;
  budgetMs?: number;
}): Promise<TypecheckPreflightResult> {
  const budgetMs = input.budgetMs ?? TYPECHECK_PREFLIGHT_BUDGET_MS;
  const started = Date.now();
  try {
    const result = typecheckDeliverySources(input);
    if (Date.now() - started > budgetMs) {
      return { ok: true, skipped: 'timeout', durationMs: Date.now() - started };
    }
    return result;
  } catch {
    return { ok: true, skipped: 'checker_failed', durationMs: Date.now() - started };
  }
}
