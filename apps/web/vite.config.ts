import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { isKnownSpaShellPath, looksLikeStaticAsset } from '../api/src/spa-paths.ts';

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
  return (
    pathname.startsWith('/api') ||
    pathname.startsWith('/@') ||
    pathname.startsWith('/node_modules') ||
    pathname.startsWith('/src') ||
    pathname.startsWith('/__') ||
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

export default defineConfig({
  plugins: [react(), spaProper404()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});
