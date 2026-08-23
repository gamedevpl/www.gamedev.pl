import ts from 'typescript';

/**
 * Type-check a candidate game edit, in memory, before it is allowed to become a
 * document.
 *
 * Why this exists at all: step 6 of the code lane is esbuild, which *transpiles*
 * TypeScript without checking it. A wrong property name, a missing field or a
 * changed shape parses perfectly and ships. Benched over 18 edits across 6
 * games, five candidates compiled and then failed the player — and only two of
 * those threw. The other three ran to completion painting nothing, or painting
 * `NaN`: in one, the game's collectible seeds simply stopped being drawn,
 * because `Math.sin(undefined)` is `NaN` and a canvas asked for a `NaN` radius
 * draws silently. Nothing downstream of esbuild can see that. `tsc` saw all five,
 * and flagged nothing else.
 *
 * The cost is a dependency and a second of latency, which `symbol-map.ts`
 * previously argued was not worth it. That judgement was made against a token
 * budget; measured, the gate *lowers* the latency tail, because it kills a
 * doomed candidate in under a second instead of letting the repair loop spend a
 * full edit call on it.
 *
 * Everything is virtual. No file is written, nothing is read from the games repo
 * except the kit declaration the caller already has in hand for the prompt, and
 * the only disk reads are TypeScript's own `lib.*.d.ts` out of node_modules.
 */

/**
 * The games repo's compiler options, mirrored.
 *
 * Deliberately a constant rather than a fetch of its `tsconfig.json`: the check
 * has to agree with what the games repo would say, and a *stricter* setting here
 * would reject edits that the repo itself considers fine. Kept in sync by the
 * games-repo contract check's sibling assertions; if the repo loosens a rule,
 * loosen it here too rather than letting players hit a gate their game does not.

 */
export const COMPILER_OPTIONS: ts.CompilerOptions = {
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

/** How many diagnostics a repair round is given. More is noise, not signal. */
const MAX_DIAGNOSTICS = 6;

/** Virtual root the game's own files live under, so nothing collides with lib paths. */
const ROOT = '/candidate';

/**
 * Parsed `lib.*.d.ts`, kept across calls.
 *
 * These are ~2MB of declarations that never change within a process, and
 * re-parsing them per candidate is the single dominant cost of the check —
 * caching them is the difference between ~2s and well under a second.
 */
const libCache = new Map<string, ts.SourceFile | undefined>();

export type TypeCheckResult = { ok: true } | { ok: false; errors: string[] };

/**
 * @param sources game-relative path → source, exactly as the lane splices them.
 * @param kitDeclaration `shared/game-kit.d.ts`. Without it every `GameKit` call
 *   is an error, so a missing kit means the check cannot run rather than that
 *   the game is broken — the caller gets `ok` and the build proceeds unchecked.
 */
export function typeCheckGame(sources: Record<string, string>, kitDeclaration: string | null): TypeCheckResult {
  if (!kitDeclaration) return { ok: true };

  const files = new Map<string, string>();
  files.set(`${ROOT}/game-kit.d.ts`, kitDeclaration);
  for (const [relative, source] of Object.entries(sources)) {
    if (relative.endsWith('.ts')) files.set(`${ROOT}/${relative}`, source);
  }
  const roots = [...files.keys()];

  const host: ts.CompilerHost = {
    fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
    readFile: (name) => files.get(name) ?? ts.sys.readFile(name),
    getSourceFile: (name, languageVersion) => {
      const own = files.get(name);
      if (own !== undefined) return ts.createSourceFile(name, own, languageVersion, true);
      if (libCache.has(name)) return libCache.get(name);
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
    // Directory questions are only asked about the virtual tree; answering them
    // from the real filesystem would let resolution wander out of it.
    directoryExists: (dir) => dir.startsWith(ROOT) || ts.sys.directoryExists(dir),
    getDirectories: (dir) => (dir.startsWith(ROOT) ? [] : ts.sys.getDirectories(dir)),
  };

  let program: ts.Program;
  try {
    program = ts.createProgram(roots, COMPILER_OPTIONS, host);
  } catch {
    // A checker that cannot start must not be able to block an edit.
    return { ok: true };
  }

  const diagnostics = [...program.getSemanticDiagnostics(), ...program.getSyntacticDiagnostics()].filter(
    // Only the game's own files. The kit declaration and the lib are not this
    // edit's business and must never fail a candidate.
    (diagnostic) =>
      diagnostic.file &&
      diagnostic.file.fileName.startsWith(`${ROOT}/`) &&
      diagnostic.file.fileName !== `${ROOT}/game-kit.d.ts`,
  );
  if (diagnostics.length === 0) return { ok: true };

  const checker = program.getTypeChecker();
  return {
    ok: false,
    errors: diagnostics.slice(0, MAX_DIAGNOSTICS).map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      if (!diagnostic.file || diagnostic.start === undefined) return `error TS${diagnostic.code}: ${message}`;
      const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      const where = `${diagnostic.file.fileName.slice(ROOT.length + 1)}:${line + 1}`;
      return `${where}: error TS${diagnostic.code}: ${message}${availableMembers(checker, diagnostic)}`;
    }),
  };
}

/**
 * Name what the model *could* have used.
 *
 * "Property 'flash' does not exist on type 'GameKitGameContext'" tells a repair
 * round that it was wrong but not what is right. The members of the one type it
 * got wrong are a few dozen words, and they are the difference between a round
 * that can succeed and one that can only guess again.
 */
function availableMembers(checker: ts.TypeChecker, diagnostic: ts.Diagnostic): string {
  if (diagnostic.code !== 2339 || !diagnostic.file || diagnostic.start === undefined) return '';
  const access = nodeAt(diagnostic.file, diagnostic.start)?.parent;
  if (!access || !ts.isPropertyAccessExpression(access)) return '';
  let names: string[];
  try {
    names = checker
      .getTypeAtLocation(access.expression)
      .getProperties()
      .map((symbol) => symbol.getName())
      .filter((name) => !name.startsWith('_'))
      .sort();
  } catch {
    return '';
  }
  return names.length ? ` (available: ${names.slice(0, 40).join(', ')})` : '';
}

function nodeAt(source: ts.SourceFile, position: number): ts.Node | undefined {
  const find = (node: ts.Node): ts.Node | undefined => {
    if (position < node.getStart(source) || position >= node.getEnd()) return undefined;
    return ts.forEachChild(node, find) ?? node;
  };
  return find(source);
}
