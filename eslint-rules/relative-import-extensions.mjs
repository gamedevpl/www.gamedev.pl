/**
 * Require an explicit `.js` extension on every relative import.
 *
 * Every package here is `"type": "module"`, which is why .github/copilot-instructions.md
 * asks for `import { x } from './mock.js'`. The convention was documented but unenforced,
 * so it held in apps/api and drifted in apps/web — and the difference is not cosmetic:
 *
 * - apps/api compiles to dist/ and is run directly by Node. Node's ESM resolver does no
 *   extension guessing, so an extensionless relative import there is a runtime crash.
 * - apps/web is bundled by Vite, which resolves extensionless specifiers happily. Nothing
 *   breaks, so nothing pushed back, so it drifted to ~210 violations.
 *
 * Enforcing it repo-wide keeps a file from acquiring a hidden dependency on the bundler
 * the day it moves — and stops reviewers (human or Copilot) having to flag it by hand.
 *
 * Written as a local rule rather than pulling in eslint-plugin-import(-x): the whole need
 * is one check, and those plugins bring their own TypeScript resolver stack to do it.
 *
 * The fix resolves against the filesystem instead of appending '.js' to whatever is
 * written. `./foo` may mean `foo.ts` *or* `foo/index.ts`, and a blind append silently
 * turns the second one into a broken import that Vite would no longer save.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Extensions that already state what they are — an asset import is not our business. */
const SETTLED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.mp3',
  '.wav',
  '.ogg',
  '.woff',
  '.woff2',
  '.wasm',
  '.txt',
  '.md',
]);

/** What a specifier may resolve to on disk, and what it should be written as. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * The specifier this one should have been written as, or undefined when nothing on disk
 * matches. Unresolvable specifiers are reported without a fix rather than guessed at.
 */
function resolveSpecifier(fromDirectory, specifier) {
  const bare = specifier.replace(/\/+$/, '');
  const target = path.resolve(fromDirectory, bare);

  for (const extension of SOURCE_EXTENSIONS) {
    if (isFile(`${target}${extension}`)) return `${bare}.js`;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    if (isFile(path.join(target, `index${extension}`))) return `${bare}/index.js`;
  }
  return undefined;
}

export const relativeImportExtensions = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require an explicit .js extension on relative imports (ESM packages).',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missing:
        "Relative import '{{specifier}}' has no extension — write '{{fixed}}'. Every package is \"type\": \"module\", and Node's ESM resolver does not guess extensions.",
      unresolved:
        "Relative import '{{specifier}}' has no extension and resolves to no .ts/.tsx file — add the right extension by hand.",
      typescript:
        "Relative import '{{specifier}}' points at TypeScript source — write '{{fixed}}'. The specifier has to name the file that exists after compilation, not before.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    // <input> and <text> stand in for piped source, where there is no directory to
    // resolve against and every specifier would look unresolvable.
    if (!filename || !path.isAbsolute(filename)) return {};
    const directory = path.dirname(filename);

    function check(source) {
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return;

      const specifier = source.value;
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) return;

      const quote = source.raw[0];
      const extension = path.extname(specifier);

      // `allowImportingTsExtensions` lets apps/web write './x.ts'; it still compiles to
      // a './x.js' on disk, so the specifier is wrong for anything but the bundler.
      if (SOURCE_EXTENSIONS.includes(extension)) {
        const fixed = `${specifier.slice(0, -extension.length)}.js`;
        context.report({
          node: source,
          messageId: 'typescript',
          data: { specifier, fixed },
          fix: (fixer) => fixer.replaceText(source, `${quote}${fixed}${quote}`),
        });
        return;
      }

      if (SETTLED_EXTENSIONS.has(extension)) return;

      const fixed = resolveSpecifier(directory, specifier);
      if (!fixed) {
        context.report({ node: source, messageId: 'unresolved', data: { specifier } });
        return;
      }

      context.report({
        node: source,
        messageId: 'missing',
        data: { specifier, fixed },
        fix: (fixer) => fixer.replaceText(source, `${quote}${fixed}${quote}`),
      });
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      // `await import('./x')` — a literal argument is checkable, a computed one is not.
      ImportExpression: (node) => check(node.source),
    };
  },
};

export default {
  rules: { 'relative-import-extensions': relativeImportExtensions },
};
