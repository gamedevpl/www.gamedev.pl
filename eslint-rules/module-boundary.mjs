/**
 * Warn on an import that crosses N1 module buckets inside `apps/api/src`.
 *
 * The `north-star-architecture.md` plan (private gamedevpl/www.gamedev.pl-ops repo -- see
 * AGENTS.md) asks for this rule in permissive (warn) mode, with the target module map, so
 * a new cross-domain edge is visible in review before any file physically moves. Phase 3
 * flips it to error module by module once the directories exist. Not registered at 'warn'
 * in the repo-wide `eslint .` pass (that would trip `--max-warnings 0` on the pre-existing
 * debt this rule is meant to surface, not block) -- run it via `npm run module-boundary`.
 *
 * A domain module may import `platform` (composition root, shared primitives, the Store)
 * and its own bucket; it may not reach into another domain's internals. A file with no
 * entry in the map gets its own warning instead of silently passing as `platform` --
 * otherwise a new file nobody classified would defeat the whole check it's meant to add.
 */
import fs from 'node:fs';
import path from 'node:path';
import { classifyModule, isMappedModule, DEFAULT_BUCKET } from './module-boundary-map.mjs';

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
        "'{{specifier}}' pulls '{{targetBucket}}' into a '{{importerBucket}}' module. Domain modules import platform/ and their own bucket, not each other's internals (N1 module map, north-star-architecture.md).",
      unmappedImporter:
        "This file has no entry in module-boundary-map.mjs, so '{{specifier}}' (bucket '{{targetBucket}}') can't be checked for crossing a boundary. Add this file's bucket to FILE_BUCKET.",
      unmappedTarget:
        "'{{specifier}}' has no entry in module-boundary-map.mjs, so this edge can't be checked for crossing a boundary. Add its bucket to FILE_BUCKET.",
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

    const importerMapped = isMappedModule(importerModulePath);
    const importerBucket = classifyModule(importerModulePath);
    // An unmapped importer's real bucket is unknown; skip only when it's explicitly platform.
    if (importerMapped && importerBucket === DEFAULT_BUCKET) return {};

    const directory = path.dirname(filename);

    function check(node, source) {
      // Erased at compile time, so a type-only edge carries no runtime coupling. Only the
      // whole-statement form (`import type { X } from`) is exempt; a mixed statement
      // (`import { type X, y }`) still imports a real value and is checked like any other.
      if (node.importKind === 'type' || node.exportKind === 'type') return;
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return;
      const specifier = source.value;
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) return;

      const resolved = resolveSpecifier(directory, specifier);
      if (!resolved) return;
      const targetModulePath = toModulePath(apiSrcRoot, resolved);
      if (targetModulePath === undefined) return;

      const targetMapped = isMappedModule(targetModulePath);
      const targetBucket = classifyModule(targetModulePath);

      if (!importerMapped) {
        // Unknown importer bucket -- only worth flagging when the target is a real,
        // known domain (an unmapped-importing-unmapped edge has nothing to say yet).
        if (targetMapped && targetBucket !== DEFAULT_BUCKET) {
          context.report({ node: source, messageId: 'unmappedImporter', data: { specifier, targetBucket } });
        }
        return;
      }

      if (!targetMapped) {
        context.report({ node: source, messageId: 'unmappedTarget', data: { specifier } });
        return;
      }

      if (targetBucket === DEFAULT_BUCKET || targetBucket === importerBucket) return;
      context.report({ node: source, messageId: 'crossBucket', data: { specifier, importerBucket, targetBucket } });
    }

    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
    };
  },
};

export default {
  rules: { 'module-boundary': moduleBoundary },
};
