import ts from 'typescript';

// Mirrors apps/api/src/type-check.ts's COMPILER_OPTIONS exactly — that file's own
// test suite deep-equals this against it (GA-03). Divergence would let the browser
// language service suggest members the server's typecheck gate then refuses. Its own
// module, not declared inside tsWorker.ts: that file calls Comlink.expose() at import
// time, which would run in the API's Node test process too if it imported from there.
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
