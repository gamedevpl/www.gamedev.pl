/**
 * Warn on an import that crosses N1 module buckets inside `apps/api/src`.
 *
 * docs/north-star-architecture.md Phase 0 asks for this rule in permissive (warn) mode,
 * with the target module map, so a new cross-domain edge is visible in review before any
 * file physically moves. Phase 3 flips it to error module by module once the directories
 * exist. Not registered at 'warn' in the repo-wide `eslint .` pass (that would trip
 * `--max-warnings 0` on the pre-existing debt this rule is meant to surface, not block) --
 * run it explicitly via `npm run module-boundary`.
 *
 * A domain module may import `platform` (composition root, shared primitives, the Store)
 * and its own bucket; it may not reach into another domain's internals. `platform` itself,
 * and anything not yet in the module map, is unrestricted -- the map only needs to grow
 * where it catches a real reach, not be complete on day one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { classifyModule, DEFAULT_BUCKET } from './module-boundary-map.mjs';

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Resolves a relative specifier to the file it names on disk, or undefined. */
function resolveSpecifier(fromDirectory, specifier) {
  // The repo's ESM convention writes './mp.js' for a source file that is actually
  // mp.ts -- strip the specifier's extension before probing disk, not append to it.
  const bare = specifier.replace(/\/+$/, '').replace(/\.jsx?$/, '');
  const target = path.resolve(fromDirectory, bare);
  for (const extension of SOURCE_EXTENSIONS) {
    if (isFile(`${target}${extension}`)) return `${target}${extension}`;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    if (isFile(path.join(target, `index${extension}`))) return path.join(target, `index${extension}`);
  }
  return undefined;
}

/** `apps/api/src`-relative path with the extension stripped, or undefined if outside it. */
function toModulePath(apiSrcRoot, absoluteFile) {
  const relative = path.relative(apiSrcRoot, absoluteFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  const posix = relative.split(path.sep).join('/');
  return posix.replace(/\.tsx?$/, '');
}

/** Nearest ancestor directory literally named `apps/api/src`, walked from the file itself. */
function findApiSrcRoot(absoluteFile) {
  let dir = path.dirname(absoluteFile);
  for (;;) {
    const parts = dir.split(path.sep);
    const n = parts.length;
    if (n >= 3 && parts[n - 1] === 'src' && parts[n - 2] === 'api' && parts[n - 3] === 'apps') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export const moduleBoundary = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Flag imports that cross apps/api/src N1 module buckets (Phase 0 warn-mode ratchet).',
    },
    schema: [],
    messages: {
      crossBucket:
        "'{{specifier}}' pulls '{{targetBucket}}' into a '{{importerBucket}}' module. Domain modules import platform/ and their own bucket, not each other's internals (docs/north-star-architecture.md, N1).",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename || !path.isAbsolute(filename)) return {};
    // Test files and fixtures wire across domains deliberately; the map is for production edges.
    if (/\.test\.tsx?$/.test(filename) || filename.includes(`${path.sep}__tests__${path.sep}`)) return {};

    const apiSrcRoot = findApiSrcRoot(filename);
    if (!apiSrcRoot) return {};
    const importerModulePath = toModulePath(apiSrcRoot, filename);
    if (importerModulePath === undefined) return {};

    const importerBucket = classifyModule(importerModulePath);
    if (importerBucket === DEFAULT_BUCKET) return {};

    const directory = path.dirname(filename);

    function check(source) {
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return;
      const specifier = source.value;
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) return;

      const resolved = resolveSpecifier(directory, specifier);
      if (!resolved) return;
      const targetModulePath = toModulePath(apiSrcRoot, resolved);
      if (targetModulePath === undefined) return;

      const targetBucket = classifyModule(targetModulePath);
      if (targetBucket === DEFAULT_BUCKET || targetBucket === importerBucket) return;

      context.report({ node: source, messageId: 'crossBucket', data: { specifier, importerBucket, targetBucket } });
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};

export default {
  rules: { 'module-boundary': moduleBoundary },
};
