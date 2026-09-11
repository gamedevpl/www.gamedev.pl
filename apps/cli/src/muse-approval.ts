import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AdapterRun } from './workshop.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export function museApproval(line: string): boolean {
  try {
    const event = JSON.parse(line);
    return (
      event?.payload_type === 'approval_wait.effect.started' ||
      (event?.payload_type === 'runtime.session' &&
        event.payload?.kind === 'approval' &&
        event.payload?.event?.kind === 'requested')
    );
  } catch {
    return false;
  }
}

export function museSession(line: string): { id: string; time: Date } | undefined {
  try {
    const event = JSON.parse(line);
    const id = event?.stream?.id;
    if (event?.stream?.kind !== 'session' || typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return;
    const time = new Date(typeof event.recorded_at === 'number' ? event.recorded_at / 1000 : Date.now());
    if (!Number.isFinite(time.getTime())) return;
    return { id, time };
  } catch {
    return;
  }
}

export function museJournalPaths(env: NodeJS.ProcessEnv, session: { id: string; time: Date }): string[] {
  const root = join(env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local', 'share'), 'muse', 'sessions');
  const utc = session.time.toISOString().slice(0, 10).replaceAll('-', '/');
  const local = [
    session.time.getFullYear(),
    String(session.time.getMonth() + 1).padStart(2, '0'),
    String(session.time.getDate()).padStart(2, '0'),
  ].join('/');
  return [...new Set([utc, local])].map((day) => join(root, day, session.id, 'session.jsonl'));
}

export function approvalJournalReader() {
  let offset = 0;
  let buffered = '';
  let skipping = false;
  return async (path: string): Promise<boolean> => {
    const file = await open(path, 'r');
    try {
      const chunk = Buffer.alloc(256 * 1024);
      const { bytesRead } = await file.read(chunk, 0, chunk.length, offset);
      offset += bytesRead;
      for (const part of chunk
        .subarray(0, bytesRead)
        .toString('utf8')
        .split(/(?<=\n)/)) {
        if (!skipping) buffered += part;
        if (part.endsWith('\n')) {
          if (!skipping && museApproval(buffered)) return true;
          buffered = '';
          skipping = false;
        } else if (buffered.length > 1024 * 1024) {
          buffered = '';
          skipping = true;
        }
      }
      return false;
    } finally {
      await file.close();
    }
  };
}

export async function runMuseWithApprovals(input: Parameters<AdapterRun>[0], run: AdapterRun): ReturnType<AdapterRun> {
  if (input.spec.name !== 'muse') return run(input);
  if (input.spec.headless.includes('--no-session-log'))
    throw new CliError(
      'Muse approval recovery requires session logging.',
      EXIT_REFUSED,
      'remove --no-session-log from the Muse adapter',
    );
  const controller = new AbortController();
  const stop = () => controller.abort();
  input.abort?.addEventListener('abort', stop, { once: true });
  if (input.abort?.aborted) stop();
  let session: ReturnType<typeof museSession>;
  let permissionSession: string | undefined;
  let pending: Promise<void> | undefined;
  const readers = new Map<string, ReturnType<typeof approvalJournalReader>>();
  const blocked = () => {
    if (!session || permissionSession || input.abort?.aborted) return;
    permissionSession = session.id;
    input.onLine?.('Muse needs your approval; pausing headless execution.');
    stop();
  };
  const check = async () => {
    if (!session || controller.signal.aborted) return;
    for (const path of museJournalPaths(input.env, session)) {
      const read = readers.get(path) ?? approvalJournalReader();
      readers.set(path, read);
      try {
        if (await read(path)) blocked();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          input.onLine?.('Cannot read Muse approval status; pausing for interactive recovery.');
          blocked();
        }
      }
    }
  };
  const timer = setInterval(() => {
    pending ??= check().finally(() => {
      pending = undefined;
    });
  }, 250);
  try {
    const result = await run({
      ...input,
      abort: controller.signal,
      onLine: (line) => {
        session ??= museSession(line);
        input.onLine?.(line);
        if (museApproval(line)) blocked();
      },
    });
    return { ...result, ...(permissionSession ? { permissionSession } : {}) };
  } finally {
    clearInterval(timer);
    controller.abort();
    await pending;
    input.abort?.removeEventListener('abort', stop);
  }
}
