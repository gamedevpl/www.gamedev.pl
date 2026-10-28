import { gameSourceRoot, projectRuntimeRoot } from '../src/source-project.ts';
import { sourceKitRoot, syncSourceRuntime } from '../src/source-project-runtime.ts';
import { sourceKitBuildDiagnostic } from '../src/source-kit-diagnostics.ts';
import { renderPlayPage } from '../src/play-page.ts';
import { playPresence, attachPlayPresence } from '../src/play-presence.ts';
import { previewAllowedHosts, previewHostConfig, trustedPreviewRequest } from '../src/preview-request.ts';

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, lstatSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
const [root, slug, statePath, key] = process.argv.slice(2);
const workspaceRoot = projectRuntimeRoot(root);
const kitRoot = sourceKitRoot(root);
const cliVersion = process.env.GAMEDEVPL_PREVIEW_VERSION;
const instanceId = randomBytes(24).toString('hex');
let html = '',
  revision = '',
  hot,
  error = 'Preparing the first playable build…';
let attemptedFingerprint = '',
  builtFingerprint = '',
  fingerprint = '',
  dirtyAt = 0,
  busy = false,
  lastVisit = Date.now();
let origin, currentBuild, hostConfig;
let allowedHosts = new Set();
const presence = playPresence(shutdown, () => !busy);
function treeStamp(dir) {
  try {
    return readdirSync(dir)
      .sort()
      .map((name) => {
        const path = join(dir, name);
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) return '';
        return stat.isDirectory() ? treeStamp(path) : path + ':' + stat.mtimeMs + ':' + stat.size;
      })
      .join('|');
  } catch {
    return '';
  }
}
function sourceStamp() {
  let sources;
  try {
    sources = gameSourceRoot(root, slug);
  } catch (failure) {
    return 'invalid-source:' + failure.message;
  }
  return [sources, join(kitRoot, 'shared'), join(kitRoot, 'starters'), join(root, 'templates'), join(kitRoot, 'tools')]
    .filter(existsSync)
    .map(treeStamp)
    .join('|');
}
function assemble() {
  try {
    syncSourceRuntime(root);
  } catch (failure) {
    error = failure.message;
    attemptedFingerprint = fingerprint;
    return;
  }
  busy = true;
  const buildingFingerprint = fingerprint;
  const source =
    'import {assembleGame} from ' +
    JSON.stringify(
      pathToFileURL(
        join(
          kitRoot,
          existsSync(join(kitRoot, 'tools/lib/assemble.js')) ? 'tools/lib/assemble.js' : 'tools/lib/assemble.ts',
        ),
      ).href,
    ) +
    '; import {existsSync,readFileSync} from "node:fs"; const manifestPath=' +
    JSON.stringify(join(workspaceRoot, 'games', slug, 'GAME.json')) +
    '; const result=assembleGame(' +
    JSON.stringify(slug) +
    ',"game.ts",{hotResources:true}); if(existsSync(manifestPath)&&JSON.parse(readFileSync(manifestPath,"utf8")).hot?.protocol===1&&![1,2].includes(result.hot?.protocol))throw Error("This game needs a newer Creator Kit for HMR. Run gamedevpl kit update, then retry the build."); process.stdout.write(JSON.stringify({html:result.html,hot:result.hot}));';
  currentBuild = execFile(
    process.execPath,
    [
      '--import',
      pathToFileURL(join(workspaceRoot, 'node_modules/tsx/dist/loader.mjs')).href,
      '--input-type=module',
      '-e',
      source,
    ],
    {
      cwd: workspaceRoot,
      env: { ...process.env, GAMEDEV_REPO_ROOT: workspaceRoot },
      timeout: 30000,
      maxBuffer: 64 * 1024 * 1024,
    },
    (failure, stdout, stderr) => {
      busy = false;
      attemptedFingerprint = buildingFingerprint;
      if (failure) {
        error = sourceKitBuildDiagnostic(root, (stderr || failure.message).slice(-4000));
        return;
      }
      if (!stdout.trim()) {
        error = 'The assembler returned an empty game.';
        return;
      }
      let compiled;
      try {
        compiled = JSON.parse(stdout);
      } catch {
        error = 'The assembler returned an invalid build.';
        return;
      }
      if (
        typeof compiled.html !== 'string' ||
        !compiled.html.trim() ||
        Buffer.byteLength(compiled.html) > 32 * 1024 * 1024
      ) {
        error = 'The assembler returned an empty or oversized game.';
        return;
      }
      if (sourceStamp() !== buildingFingerprint) {
        dirtyAt = Date.now();
        return;
      }
      html = compiled.html;
      hot = compiled.hot;
      builtFingerprint = buildingFingerprint;
      revision = createHash('sha256').update(html).digest('hex');
      error = '';
    },
  );
}
const server = createServer((req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  if (!origin) {
    res.writeHead(503);
    res.end();
    return;
  }
  if (!trustedPreviewRequest(req, allowedHosts, req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(403);
    res.end();
    return;
  }
  const base = '/';
  const path = (req.url || '').split('?')[0];
  lastVisit = Date.now();
  if (req.method === 'POST' && path === base + 'stop') {
    res.end('stopped', shutdown);
    return;
  }
  if (req.method === 'POST' && path === base + 'retry') {
    if (!busy) {
      fingerprint = sourceStamp();
      dirtyAt = 0;
      error = '';
      assemble();
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ busy }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  if (path === base + 'status') {
    const stamp = sourceStamp();
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        key,
        cliVersion,
        hostConfig,
        revision,
        error: attemptedFingerprint === stamp ? error : '',
        busy,
        stale: builtFingerprint !== stamp,
        canRetry: true,
        hot: !!hot,
      }),
    );
    return;
  }
  if (path === base + 'game') {
    // Game documents are only supplied to the trusted shell as inert text.
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(html);
    return;
  }
  if (path === base + 'hot') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ revision, hot }));
    return;
  }
  if (path !== base) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader(
    'content-security-policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'self' " +
      origin.replace('http:', 'ws:') +
      "; font-src data:; frame-src 'self' about:; frame-ancestors 'none'",
  );
  res.end(renderPlayPage({ revision, html, error: attemptedFingerprint === sourceStamp() ? error : '', busy }));
});
function shutdown() {
  try {
    const current = JSON.parse(readFileSync(statePath, 'utf8'));
    if (current.instanceId === instanceId) rmSync(statePath, { force: true });
  } catch {}
  presence.close();
  currentBuild?.kill();
  server.closeAllConnections();
  server.close();
  clearInterval(timer);
  process.exit(0);
}
server.listen(0, '127.0.0.1', () => {
  origin = 'http://127.0.0.1:' + server.address().port;
  allowedHosts = previewAllowedHosts(origin, process.env);
  hostConfig = previewHostConfig(allowedHosts);
  attachPlayPresence(server, presence, (req) => trustedPreviewRequest(req, allowedHosts) && req.url === '/presence');
  const pendingState = statePath + '.' + instanceId;
  writeFileSync(
    pendingState,
    JSON.stringify({ url: origin + '/', instanceId, hostConfig, key, root, slug, cliVersion }),
    {
      mode: 0o600,
      flag: 'wx',
    },
  );
  renameSync(pendingState, statePath);
  fingerprint = sourceStamp();
  assemble();
});
server.on('error', () => process.exit(1));
const timer = setInterval(() => {
  if (!busy && !presence.connected && Date.now() - lastVisit > 30 * 60_000) return shutdown();
  const next = sourceStamp();
  if (next !== fingerprint) {
    fingerprint = next;
    dirtyAt = Date.now();
  }
  if (dirtyAt && !busy && Date.now() - dirtyAt >= 500) {
    dirtyAt = 0;
    assemble();
  }
}, 500);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
