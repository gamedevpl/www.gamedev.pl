import { createHash } from 'node:crypto';
import { readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { findCheckout } from './checkout.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { privatePlayDirectory, readPlayState } from './play-state.js';
import { savePlayJournal, type PlayJournal } from './workbench-launch.js';

export type PreviewSession = { url: string; key: string; root?: string; slug?: string };
export type PlaySession = {
  id: string;
  kind: 'workbench' | 'preview';
  url: string;
  cwd?: string;
  slug?: string;
  key: string;
};

export function previewKey(root: string, slug: string): string {
  return createHash('sha256').update(`${root}\0${slug}`).digest('hex');
}

export async function alivePreview(path: string, key: string): Promise<PreviewSession | null> {
  const raw = readPlayState(path);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as PreviewSession;
    const url = new URL(state.url);
    if (
      state.key !== key ||
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/[a-f0-9]{48}\/$/.test(url.pathname)
    )
      return null;
    const res = await fetch(`${state.url}status`, { signal: AbortSignal.timeout(600), redirect: 'error' });
    return res.ok && ((await res.json()) as PreviewSession).key === key ? state : null;
  } catch {
    return null;
  }
}

export async function listPlaySessions(): Promise<PlaySession[]> {
  const found: PlaySession[] = [];
  for (const kind of ['workbench', 'preview'] as const) {
    const base = join(tmpdir(), `gamedev-${kind === 'preview' ? 'play' : 'workbench'}-${process.getuid?.() ?? 'user'}`);
    privatePlayDirectory(base);
    await Promise.all(
      readdirSync(base)
        .filter((entry) => /^[a-f0-9]{64}\.json$/.test(entry))
        .map(async (entry) => {
          const key = entry.slice(0, -5),
            path = join(base, entry);
          try {
            if (kind === 'preview') {
              const state = await alivePreview(path, key);
              if (!state) return;
              const metadata =
                typeof state.root === 'string' &&
                isAbsolute(state.root) &&
                typeof state.slug === 'string' &&
                previewKey(state.root, state.slug) === key;
              found.push({
                id: `p-${key}`,
                key,
                kind,
                url: state.url,
                cwd: metadata ? state.root : undefined,
                slug: metadata ? state.slug : undefined,
              });
              return;
            }
            const raw = readPlayState(path);
            if (!raw) return;
            const journal = JSON.parse(raw);
            if (
              journal.version !== 1 ||
              typeof journal.cwd !== 'string' ||
              !isAbsolute(journal.cwd) ||
              typeof journal.instance !== 'string'
            )
              return;
            const cwd = journal.checkout?.root ?? journal.cwd;
            const slug = journal.slug ?? journal.checkout?.slug ?? journal.launch?.slug;
            if (typeof cwd !== 'string' || !isAbsolute(cwd) || (slug !== undefined && typeof slug !== 'string')) return;
            const url = new URL(journal.url);
            if (
              url.protocol !== 'http:' ||
              url.hostname !== '127.0.0.1' ||
              url.username ||
              url.password ||
              url.pathname !== '/' ||
              url.search ||
              !/^#[a-f0-9]{64}$/.test(url.hash)
            )
              return;
            const res = await fetch(`${url.origin}/state`, {
              headers: { Authorization: `Bearer ${url.hash.slice(1)}` },
              signal: AbortSignal.timeout(600),
              redirect: 'error',
            });
            if (!res.ok) return;
            if (((await res.json()) as { version?: unknown } | null)?.version !== 1) return;
            found.push({
              id: `w-${key}`,
              key,
              kind,
              url: journal.url,
              cwd,
              slug,
            });
          } catch {
            // One expired or invalid record cannot hide other sessions.
          }
        }),
    );
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

export function sessionLines(sessions: PlaySession[]): string[] {
  if (!sessions.length) return ['no local play session is running'];
  const label = (session: PlaySession): string => {
    let length = 14;
    while (sessions.filter((other) => other.id.startsWith(session.id.slice(0, length))).length > 1) length++;
    return session.id.slice(0, length);
  };
  return [
    'Running local Play sessions:',
    ...sessions.flatMap((session) => [
      `  ${label(session)}  ${session.kind}  ${session.slug ?? '(unknown game)'}  ${session.cwd ?? '(older CLI: directory unavailable)'}`,
      `    ${session.url}`,
      `    Stop: gamedevpl play --stop --session ${label(session)}`,
    ]),
    'Stop all: gamedevpl play --stop --all',
  ];
}

export function selectPlaySessions(
  sessions: PlaySession[],
  input: { cwd: string; slug?: string; all?: boolean; session?: string },
): PlaySession[] {
  if ([Boolean(input.slug), Boolean(input.all), Boolean(input.session)].filter(Boolean).length > 1)
    throw new CliError('Choose one stop target: a game slug, --session <id>, or --all.', EXIT_INPUT);
  if (input.all) return sessions;
  if (input.session) {
    if (!/^[pw]-[a-f0-9]{8,64}$/.test(input.session))
      throw new CliError('Use a session ID from gamedevpl play --list.', EXIT_INPUT);
    const matches = sessions.filter((s) => s.id.startsWith(input.session!));
    if (matches.length !== 1)
      throw new CliError(
        matches.length ? 'Session ID is ambiguous.' : 'No running Play session has that ID.',
        EXIT_REFUSED,
        sessionLines(sessions).join('\n'),
      );
    return matches;
  }
  const checkout = findCheckout(input.cwd);
  let cwd = checkout?.root ?? input.cwd;
  try {
    cwd = realpathSync(cwd);
  } catch {
    // Sessions remain discoverable after their checkout directory is removed.
  }
  const matches = sessions.filter((s) => {
    const legacyLocal = checkout && s.kind === 'preview' && s.key === previewKey(cwd, input.slug ?? checkout.slug);
    if (input.slug) return s.slug === input.slug || Boolean(legacyLocal);
    if (legacyLocal) return true;
    if (checkout && s.slug && s.slug !== checkout.slug) return false;
    if (!s.cwd) return false;
    const rel = relative(s.cwd, cwd);
    return (
      rel === '' ||
      (rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel))
    );
  });
  if (new Set(matches.map((s) => s.cwd ?? cwd)).size > 1)
    throw new CliError(
      'Several Play sessions match. Choose --session <id> or --all.',
      EXIT_REFUSED,
      sessionLines(matches).join('\n'),
    );
  return matches;
}

export async function stopDiscoveredSession(session: PlaySession): Promise<void> {
  const url = new URL(session.url);
  const preview = session.kind === 'preview';
  const res = await fetch(preview ? `${session.url}stop` : `${url.origin}/stop`, {
    method: 'POST',
    headers: preview ? { Origin: url.origin } : { Authorization: `Bearer ${url.hash.slice(1)}` },
    signal: AbortSignal.timeout(2000),
    redirect: 'error',
  });
  await res.body?.cancel();
  if (!res.ok)
    throw new CliError(`Play session ${session.id.slice(0, 14)} refused stop (${res.status}).`, EXIT_REFUSED);
  if (!preview) {
    const path = join(tmpdir(), `gamedev-workbench-${process.getuid?.() ?? 'user'}`, `${session.key}.json`);
    const raw = readPlayState(path);
    if (raw) {
      const journal = JSON.parse(raw) as PlayJournal;
      if (journal.url === session.url) {
        journal.ended = true;
        delete journal.pid;
        delete journal.url;
        savePlayJournal(path, journal);
      }
    }
  }
}
