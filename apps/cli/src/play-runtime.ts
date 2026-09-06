import { PLAY_PAGE } from './play-page.js';

// Embedded source lets the bundled CLI launch an independent server.
export const PLAY_RUNTIME = String.raw`
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, lstatSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
const [root, slug, statePath, key] = process.argv.slice(2);
const token = randomBytes(24).toString('hex');
let html = '', revision = '', error = 'Preparing the first playable build…';
let fingerprint = '', dirtyAt = 0, busy = false, lastVisit = Date.now();
let origin, currentBuild;
function treeStamp(dir) {
  try {
    return readdirSync(dir).sort().map(name => {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) return '';
      return stat.isDirectory() ? treeStamp(path) : path + ':' + stat.mtimeMs + ':' + stat.size;
    }).join('|');
  } catch { return ''; }
}
function assemble() {
  busy = true;
  const source = 'import {assembleGame} from ' + JSON.stringify(pathToFileURL(join(root, 'tools/lib/assemble.ts')).href) + '; process.stdout.write(assembleGame(' + JSON.stringify(slug) + ').html);';
  currentBuild = execFile(process.execPath, ['--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, '--input-type=module', '-e', source],
    { cwd: root, env: { ...process.env, GAMEDEV_REPO_ROOT: root }, timeout: 30000, maxBuffer: 32 * 1024 * 1024 }, (failure, stdout, stderr) => {
      busy = false;
      if (failure) { error = (stderr || failure.message).slice(-4000); return; }
      if (!stdout.trim()) { error = 'The assembler returned an empty game.'; return; }
      html = stdout;
      revision = createHash('sha256').update(html).digest('hex');
      error = '';
    });
}
const shell = ${JSON.stringify(PLAY_PAGE)};
const server = createServer((req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  if (!origin) { res.writeHead(503); res.end(); return; }
  if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) { res.writeHead(403); res.end(); return; }
  const base = '/' + token + '/';
  const path = (req.url || '').split('?')[0];
  if (!path.startsWith(base)) { res.writeHead(404); res.end(); return; }
  lastVisit = Date.now();
  if (req.method === 'POST' && path === base + 'stop') { res.end('stopped', shutdown); return; }
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  if (path === base + 'status') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ key, revision, error, busy })); return; }
  if (path === base + 'game') {
    // Game documents are only supplied to the trusted shell as inert text.
    res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end(html); return;
  }
  if (path !== base) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('content-security-policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'self'; frame-src 'self' about:; frame-ancestors 'none'");
  res.end(shell);
});
function shutdown() {
  try { const current = JSON.parse(readFileSync(statePath, 'utf8')); if (current.url === origin + '/' + token + '/') rmSync(statePath, { force: true }); } catch {}
  currentBuild?.kill();
  server.closeAllConnections(); server.close(); clearInterval(timer); process.exit(0);
}
server.listen(0, '127.0.0.1', () => {
  origin = 'http://127.0.0.1:' + server.address().port;
  const pendingState = statePath + '.' + token;
  writeFileSync(pendingState, JSON.stringify({ url: origin + '/' + token + '/', key }), { mode: 0o600, flag: 'wx' });
  renameSync(pendingState, statePath);
});
server.on('error', () => process.exit(1));
const timer = setInterval(() => {
  if (Date.now() - lastVisit > 30 * 60_000) return shutdown();
  const next = [join(root, 'games', slug), join(root, 'shared'), join(root, 'starters'), join(root, 'templates'), join(root, 'tools')].filter(existsSync).map(treeStamp).join('|');
  if (next !== fingerprint) { fingerprint = next; dirtyAt = Date.now(); }
  if (dirtyAt && !busy && Date.now() - dirtyAt >= 500) { dirtyAt = 0; assemble(); }
}, 500);
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
`;
