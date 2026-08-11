import ts from 'typescript';

// Mirrors type-check.ts; own module, so tests skip tsWorker's expose().
export const COMPILER_OPTIONS: ts.CompilerOptions = {
  noEmit: true,
  strict: true,
  noImplicitAny: false,
  strictPropertyInitialization: false,
  useUnknownInCatchVariables: false,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
};
