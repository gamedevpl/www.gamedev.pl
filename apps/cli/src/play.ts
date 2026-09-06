import { privatePlayDirectory, readPlayState, lockAge } from './play-state.js';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findCheckout } from './checkout.js';
import { childEnv } from './delegate.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { openUrl } from './open-url.js';
import { prepareWorkspace } from './prepare-workspace.js';
import { PLAY_RUNTIME } from './play-runtime.js';
import type { CliTelemetry } from './telemetry.js';

type Session = { url: string; key: string };
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isPlayRequest(text: string, activeSlug?: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/u, '')
    .replace(/\s+/gu, ' ');
  const launch = /^(?:uruchom|odpal|otw[oó]rz|launch|open|start|play) (.+)$/u.exec(normalized);
  if (launch) {
    const target = launch[1];
    if (
      /^(?:(?:t[eę]|t[aą]) )?(?:gr[eę]|gierk[eę])$/u.test(target) ||
      /^(?:(?:this|the) )?game$/u.test(target) ||
      (activeSlug !== undefined && target === activeSlug.toLowerCase())
    )
      return true;
  }
  return /^(?:chc[eę] (?:zagra[cć]|pogra[cć])(?: w (?:t[eę]|ta|t[aą]) (?:gr[eę]|gierk[eę]))?|(?:zagrajmy|odpal (?:gr[eę]|gierk[eę]))|(?:i (?:want to|wanna) play(?: (?:this|the) game)?|let'?s play(?: (?:this|the) game)?|play (?:this|the) game))$/u.test(
    normalized,
  );
}

async function alive(path: string, key: string): Promise<Session | null> {
  const raw = readPlayState(path);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as Session;
    const url = new URL(state.url);
    if (
      state.key !== key ||
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !/^\/[a-f0-9]{48}\/$/.test(url.pathname)
    )
      return null;
    const res = await fetch(`${state.url}status`, { signal: AbortSignal.timeout(600), redirect: 'error' });
    return res.ok && ((await res.json()) as Session).key === key ? state : null;
  } catch {
    return null;
  }
}

export async function startLocalPlay(input: {
  root: string;
  slug: string;
  env: NodeJS.ProcessEnv;
  write: (line: string) => void;
  stop?: boolean;
  prepared?: boolean;
  abort?: AbortSignal;
}): Promise<Session | null> {
  const checkAbort = () => {
    if (input.abort?.aborted) throw new CliError('preview startup cancelled', EXIT_REFUSED);
  };
  checkAbort();
  const root = realpathSync(input.root);
  const key = createHash('sha256').update(`${root}\0${input.slug}`).digest('hex');
  const dir = join(tmpdir(), `gamedev-play-${process.getuid?.() ?? 'user'}`);
  privatePlayDirectory(dir);
  const statePath = join(dir, `${key}.json`);
  const lock = join(dir, `${key}.lock`);
  const existing = await alive(statePath, key);
  if (input.stop) {
    if (existing) {
      const response = await fetch(`${existing.url}stop`, {
        method: 'POST',
        headers: { Origin: new URL(existing.url).origin },
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) throw new CliError(`preview refused stop (${response.status})`, EXIT_REFUSED);
      await response.text();
    }
    input.write(existing ? 'local preview stopped' : 'no local preview is running');
    return null;
  }
  if (existing) return existing;
  for (let attempt = 0; ; attempt++) {
    checkAbort();
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, 'owner'), String(process.pid));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const running = await alive(statePath, key);
      if (running) return running;
      const age = lockAge(lock);
      if (age === null) continue;
      let abandoned = false;
      if (age > 2000) {
        try {
          const owner = Number(readFileSync(join(lock, 'owner'), 'utf8'));
          if (!Number.isInteger(owner) || owner <= 0) abandoned = true;
          else process.kill(owner, 0);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          abandoned = code === 'ESRCH' || (code === 'ENOENT' && age > 30000);
        }
      }
      if (abandoned || age > 15 * 60_000) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (attempt >= 1200)
        throw new CliError('preview startup is still locked', EXIT_REFUSED, 'retry after setup finishes');
      await delay(250);
    }
  }
  try {
    const raced = await alive(statePath, key);
    if (raced) return raced;
    checkAbort();
    if (!input.prepared) await prepareWorkspace({ cwd: root, env: input.env, write: input.write, abort: input.abort });
    checkAbort();
    const runtime = join(mkdtempSync(join(dir, 'runtime-')), 'server.mjs');
    writeFileSync(runtime, PLAY_RUNTIME, { mode: 0o600 });
    const child = spawn(process.execPath, [runtime, root, input.slug, statePath, key], {
      cwd: root,
      env: childEnv(input.env, ''),
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    });
    let failed = false;
    child.once('error', () => {
      failed = true;
    });
    child.unref();
    for (let attempt = 0; attempt < 40 && !failed; attempt++) {
      if (input.abort?.aborted) {
        child.kill();
        checkAbort();
      }
      const ready = await alive(statePath, key);
      if (ready) {
        if (input.abort?.aborted) {
          child.kill();
          checkAbort();
        }
        return ready;
      }
      await delay(100);
    }
    child.kill();
    throw new CliError('local preview could not start', EXIT_REFUSED, 'check the Creator Kit and Node installation');
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export async function playGame(input: {
  cwd: string;
  slug?: string;
  origin: string;
  env?: NodeJS.ProcessEnv;
  noOpen?: boolean;
  stop?: boolean;
  write: (line: string) => void;
  telemetry?: CliTelemetry;
  open?: typeof openUrl;
}): Promise<{ url?: string; mode: 'local' | 'remote' }> {
  const checkout = findCheckout(input.cwd);
  const slug = input.slug ?? checkout?.slug;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new CliError('choose a game: gamedevpl play <slug>', EXIT_INPUT);
  let url: string;
  const mode = checkout?.slug === slug ? 'local' : 'remote';
  if (mode === 'local') {
    const session = await startLocalPlay({
      root: checkout!.root,
      slug,
      env: input.env ?? process.env,
      write: input.write,
      stop: input.stop,
    });
    if (!session) return { mode };
    url = session.url;
  } else {
    if (input.stop) throw new CliError('no matching local checkout to stop', EXIT_INPUT);
    url = `${input.origin}/play/${encodeURIComponent(slug)}`;
  }
  input.write(`${mode === 'local' ? 'local live preview' : 'remote game'}: ${url}`);
  input.telemetry?.record('play_requested');
  if (!input.noOpen && !(await (input.open ?? openUrl)(url))) input.write('open this URL in your browser');
  return { url, mode };
}
