import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { isKnownSpaShellPath, looksLikeStaticAsset } from '../api/src/platform/spa-paths.js';
import {
  type BundleFile,
  deferredAssetEntries,
  reachableFromShell,
  replaceBuildManifest,
  shellAssetEntries,
  shellRevision,
} from './src/shellPrecache.js';

const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3001';

type WriteHead = ServerResponse['writeHead'];

/**
 * Vite's default SPA fallback always answers 200. Mirror production: known deep
 * links stay 200, unknown paths get a proper HTTP 404 while still serving the
 * transformed `index.html` so the client NotFound page boots.
 *
 * Implemented by forcing the status on the response for unknown document
 * navigations — Vite still rewrites the URL to `/index.html` and transforms it.
 */
function spaProper404(): Plugin {
  return {
    name: 'spa-proper-404',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }

        const pathname = pathnameOf(req);
        if (isViteInternal(pathname) || looksLikeStaticAsset(pathname) || isKnownSpaShellPath(pathname)) {
          next();
          return;
        }

        forceStatus(res, 404);
        next();
      });
    },
  };
}

function pathnameOf(req: IncomingMessage): string {
  return (req.url ?? '/').split('?')[0] ?? '/';
}

function isViteInternal(pathname: string): boolean {
  const prefixes = ['/api', '/oauth/', '/.well-known', '/@', '/node_modules', '/src', '/__'];
  return (
    prefixes.some((p) => pathname.startsWith(p)) ||
    pathname === '/oauth' ||
    pathname === '/device' ||
    pathname === '/index.html'
  );
}

/** Ensure later `writeHead(200)` / default 200 from the HTML middleware become 404. */
function forceStatus(res: ServerResponse, status: number): void {
  res.statusCode = status;

  const originalWriteHead = res.writeHead.bind(res) as WriteHead;
  res.writeHead = ((code: number, ...rest: unknown[]) => {
    const forced = code === 200 ? status : code;
    return (originalWriteHead as (...args: unknown[]) => ServerResponse)(forced, ...rest);
  }) as WriteHead;
}

/**
 * Bake the built shell's asset list into `dist/sw.js` (see `src/shellPrecache.ts`).
 *
 * Runs in `writeBundle`, once the hashed files exist on disk and Vite has copied
 * `public/sw.js` over — so both the names and the bytes being hashed are final. The
 * later `scripts/precompress.mjs` pass then compresses the rewritten worker, not the
 * placeholder one, because it is a separate step that runs after the whole build.
 */
function shellPrecache(): Plugin {
  return {
    name: 'shell-precache',
    apply: 'build',
    async writeBundle(options, bundle) {
      const outDir = options.dir ?? 'dist';
      const indexHtml = await readFile(path.join(outDir, 'index.html'), 'utf8');

      // Reduce Rollup's bundle to what reachableFromShell needs.
      const files: Record<string, BundleFile> = {};
      for (const [fileName, output] of Object.entries(bundle)) {
        files[fileName] =
          output.type === 'chunk'
            ? {
                kind: 'chunk',
                text: output.code,
                isEntry: output.isEntry,
                isDynamicEntry: output.isDynamicEntry,
                imports: output.imports,
              }
            : { kind: 'asset', text: typeof output.source === 'string' ? output.source : undefined };
      }
      const reachable = reachableFromShell(files, indexHtml);
      const isDeferred = (fileName: string) => !reachable.has(fileName);

      const shell = shellAssetEntries(Object.keys(bundle), isDeferred);
      const deferred = deferredAssetEntries(Object.keys(bundle), isDeferred);

      const contents = await Promise.all(shell.map((entry) => readFile(path.join(outDir, entry.slice(1)))));
      const revision = shellRevision(contents, (input) => createHash('sha256').update(input).digest('hex'));

      const swPath = path.join(outDir, 'sw.js');
      const source = await readFile(swPath, 'utf8');
      await writeFile(swPath, replaceBuildManifest(source, { revision, shell, deferred }));

      const bytes = contents.reduce((sum, buffer) => sum + buffer.byteLength, 0);
      this.info(`shell precache: ${shell.length} files, ${(bytes / 1024).toFixed(0)} kB, revision ${revision}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), spaProper404(), shellPrecache()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ['/api', '/oauth', '/device', '/.well-known'].map((p) => [p, { target: apiTarget, changeOrigin: true }]),
    ),
  },
  // GA-02: tsWorker.ts needs code-split chunks; IIFE can't.
  worker: {
    format: 'es',
  },
});
