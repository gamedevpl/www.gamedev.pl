import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import gamedevRules from './eslint-rules/index.mjs';

// Flat config lints a file only when some block's `files` pattern matches it, so the
// ts/tsx blocks below are what define the lint surface — the same one `--ext ts,tsx` gave.
const TS_FILES = ['**/*.ts', '**/*.tsx'];

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      // Agent worktrees are checkouts of *other branches* nested inside this one.
      // Flat config does not read .gitignore, so without this the repo lints code
      // that isn't on this branch and fails on findings nobody here can fix.
      '**/.claude/worktrees/**',
      // Plain JS was never linted under `--ext ts,tsx`; the game templates, the engine
      // and the service worker run against globals this config does not declare.
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      // Game sources standing in for the *external* games repo, not code this repo
      // authors. They exist to pin the assembler's contract, so they must keep whatever
      // shape real published games have — normalising them to local convention would
      // quietly stop testing the thing they were checked in to test.
      'apps/api/fixtures/**',
    ],
  },
  { ...js.configs.recommended, files: TS_FILES },
  // Carries the parser plus the `eslint-recommended` block that switches off the core
  // rules TypeScript already covers (no-undef, no-unused-vars, no-redeclare, ...).
  ...tsPlugin.configs['flat/recommended'],
  {
    files: TS_FILES,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { gamedev: gamedevRules },
    rules: {
      // `ignoreRestSiblings` covers the omit-a-key idiom — `const { gone: _x, ...rest }`
      // — which is the standard way to drop a field before a write and is not an unused
      // variable in any meaningful sense. It is on by default in ESLint's base rule and
      // off in the TS plugin's, which is the whole reason it has to be said here.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // The ESM convention copilot-instructions.md documents. Unenforced it held in
      // apps/api (where Node would crash without it) and drifted in apps/web (where
      // Vite covers for it), which left reviewers flagging it by hand forever.
      'gamedev/relative-import-extensions': 'error',
      // Not enabled here: it would trip --max-warnings 0 on pre-existing cross-module
      // debt. Run explicitly via `npm run module-boundary` (see eslint-rules/module-boundary.mjs).
    },
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      // The two rules this repo has always enforced. react-hooks 7's `recommended` also
      // turns on the React Compiler rules (purity, refs, set-state-in-effect, ...); those
      // flag 14 pre-existing issues here, so adopting them is its own piece of work.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
