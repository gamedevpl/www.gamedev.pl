import ts from 'typescript';

// Mirrors type-check.ts; own module, so tests skip tsWorker's expose().
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
