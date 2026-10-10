import { privatePlayDirectory, lockAge } from './play-state.js';
import {
  alivePreview as alive,
  previewKey,
  listPlaySessions,
  selectPlaySessions,
  sessionLines,
  stopDiscoveredSession,
  type PreviewSession as Session,
} from './play-sessions.js';
import { spawn } from 'node:child_process';
import {
  closeSync,
  openSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findCheckout } from './checkout.js';
import { childEnv } from './delegate.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { openUrl } from './open-url.js';
import { prepareWorkspace } from './prepare-workspace.js';
import { PLAY_RUNTIME } from './play-runtime.js';
import type { CliTelemetry } from './telemetry.js';
import { CLI_VERSION, compareSemver } from './update.js';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function startLocalPlay(input: {
  root: string;
  slug: string;
  env: NodeJS.ProcessEnv;
  write: (line: string) => void;
  stop?: boolean;
  prepared?: boolean;
  abort?: AbortSignal;
  detached?: boolean;
}): Promise<Session | null> {
  const checkAbort = () => {
    if (input.abort?.aborted) throw new CliError('preview startup cancelled', EXIT_REFUSED);
  };
  checkAbort();
  const root = realpathSync(input.root);
  const key = previewKey(root, input.slug);
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
  if (existing?.cliVersion === CLI_VERSION) return existing;
  for (let attempt = 0; ; attempt++) {
    checkAbort();
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, 'owner'), String(process.pid));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const running = await alive(statePath, key);
      if (running?.cliVersion === CLI_VERSION) return running;
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
    if (raced?.cliVersion === CLI_VERSION) return raced;
    if (raced) {
      if (raced.cliVersion && compareSemver(raced.cliVersion, CLI_VERSION) > 0)
        throw new CliError('The preview uses a newer CLI.', EXIT_REFUSED, 'Run gamedevpl update, then retry play.');
      input.write(`Restarting preview from ${raced.cliVersion ?? 'an older CLI'} with gamedevpl ${CLI_VERSION}…`);
      await stopDiscoveredSession({ id: `p-${key}`, key, kind: 'preview', url: raced.url });
      for (let attempt = 0; await alive(statePath, key); attempt++) {
        checkAbort();
        if (attempt >= 40)
          throw new CliError('The old preview has not stopped.', EXIT_REFUSED, 'Run gamedevpl stop, then retry play.');
        await delay(100);
      }
    }
    checkAbort();
    if (!input.prepared) await prepareWorkspace({ cwd: root, env: input.env, write: input.write, abort: input.abort });
    checkAbort();
    const runtime = join(mkdtempSync(join(dir, 'runtime-')), 'server.mjs');
    writeFileSync(runtime, PLAY_RUNTIME, { mode: 0o600 });
    const logPath = join(runtime, '..', 'startup.log');
    const log = openSync(logPath, 'wx', 0o600);
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, [runtime, root, input.slug, statePath, key], {
        cwd: root,
        env: { ...childEnv(input.env, ''), GAMEDEVPL_PREVIEW_VERSION: CLI_VERSION },
        stdio: ['ignore', log, log],
        detached: input.detached ?? true,
        windowsHide: true,
      });
    } finally {
      closeSync(log);
    }
    let failed = false;
    child.once('error', () => {
      failed = true;
    });
    child.once('exit', () => {
      failed = true;
    });
    if (input.detached === false && input.abort) {
      const stop = () => {
        child.kill();
      };
      input.abort.addEventListener('abort', stop, { once: true });
      child.once('close', () => input.abort?.removeEventListener('abort', stop));
      if (input.abort.aborted) stop();
    }
    child.unref();
    for (let attempt = 0; attempt < 40 && !failed; attempt++) {
      if (input.abort?.aborted) {
        child.kill();
        checkAbort();
      }
      const ready = await alive(statePath, key);
      if (ready?.cliVersion === CLI_VERSION) {
        if (input.abort?.aborted) {
          child.kill();
          checkAbort();
        }
        return ready;
      }
      await delay(100);
    }
    child.kill();
    throw new CliError(
      'local preview could not start',
      EXIT_REFUSED,
      `Startup diagnostics: ${logPath}. Check browser/loopback permissions and the Creator Kit; do not bypass sandbox restrictions.`,
    );
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export async function stopPlaySession(input: {
  cwd: string;
  slug?: string;
  all?: boolean;
  session?: string;
  env?: NodeJS.ProcessEnv;
  write: (line: string) => void;
  onLocalPreview?: (url: string) => void;
}): Promise<boolean> {
  const sessions = await listPlaySessions();
  const targets = selectPlaySessions(sessions, input);
  const checkout = findCheckout(input.cwd);
  const currentKey = checkout ? previewKey(checkout.root, checkout.slug) : undefined;
  const clearPreview =
    input.all ||
    targets.some((target) => target.kind === 'preview' && target.key === currentKey) ||
    (!input.session && (!input.slug || input.slug === checkout?.slug));
  if (!targets.length) {
    if (clearPreview) input.onLocalPreview?.('');
    input.write('no local play session is running for this target');
    if (sessions.length) sessionLines(sessions).forEach((line) => input.write(line));
    return false;
  }
  const failures: string[] = [];
  for (const target of targets) {
    try {
      await stopDiscoveredSession(target);
      input.write(`stopped ${target.kind} ${target.id.slice(0, 14)}: ${target.slug ?? 'unknown game'}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (clearPreview && !failures.length) input.onLocalPreview?.('');
  if (failures.length)
    throw new CliError(failures.join('\n'), EXIT_REFUSED, 'Run gamedevpl play --list to check remaining sessions.');
  input.write(`stopped ${targets.length} local Play session${targets.length === 1 ? '' : 's'}`);
  const remaining = sessions.filter((session) => !targets.includes(session));
  if (remaining.length) sessionLines(remaining).forEach((line) => input.write(line));
  return true;
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
  onLocalPreview?: (url: string) => void;
  abort?: AbortSignal;
  detached?: boolean;
}): Promise<{ url?: string; mode: 'local' | 'remote' }> {
  if (input.stop) {
    const checkout = findCheckout(input.cwd);
    const slug = input.slug ?? checkout?.slug;
    const mode = checkout && checkout.slug === slug ? 'local' : 'remote';
    await stopPlaySession({
      cwd: input.cwd,
      slug: input.slug,
      env: input.env,
      write: input.write,
      onLocalPreview: input.onLocalPreview,
    });
    return { mode };
  }
  const checkout = findCheckout(input.cwd);
  const slug = input.slug ?? checkout?.slug;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new CliError('choose a game: gamedevpl play <slug>', EXIT_INPUT);
  let url: string;
  const mode = checkout && checkout.slug === slug ? 'local' : 'remote';
  if (mode === 'local') {
    const session = await startLocalPlay({
      root: checkout!.root,
      slug,
      env: input.env ?? process.env,
      write: input.write,
      stop: input.stop,
      abort: input.abort,
      detached: input.detached,
    });
    if (!session) {
      if (input.stop) input.onLocalPreview?.('');
      return { mode };
    }
    url = session.url;
    input.onLocalPreview?.(url);
  } else {
    url = `${input.origin}/play/${encodeURIComponent(slug)}`;
  }
  input.write(`${mode === 'local' ? 'local live preview' : 'remote game'}: ${url}`);
  input.telemetry?.record('play_requested');
  if (!input.noOpen && !(await (input.open ?? openUrl)(url))) input.write('open this URL in your browser');
  return { url, mode };
}
