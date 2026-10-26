import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { liveArguments, liveHello, liveResult, type LiveToolName } from './live-game-protocol.js';
import { createJournalStore } from './live-journal-store.js';

type Tab = { socket: WebSocket; tabId: string; sourceId: number; revision: string };
type Pending = { tab: Tab; finish(error?: Error, data?: unknown): void };
const registry = new Map<string, LiveGame>();
export type LiveGame = ReturnType<typeof createLiveGame>;

export function findLiveGame(url: string | undefined) {
  return url ? registry.get(url) : undefined;
}

export function createLiveGame(currentSource: () => number) {
  const journal = createJournalStore();
  const tabs = new Map<WebSocket, Tab>();
  const pending = new Map<string, Pending>();
  let registered = '';
  let selected: WebSocket | undefined;
  let owner: { task: string; tab: Tab } | undefined;
  const revoked = new Set<string>();
  let busy = false;
  const send = (socket: WebSocket, data: unknown) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
  };
  const available = () => [...tabs.values()].filter((t) => t.sourceId === currentSource() && t.revision);
  const invalidate = (tab: Tab, reason: string) => {
    if (owner?.tab === tab) {
      revoked.add(owner.task);
      owner = undefined;
    }
    send(tab.socket, { type: 'live:release' });
    for (const request of pending.values()) if (request.tab === tab) request.finish(Error(reason));
  };
  const request = (tab: Tab, operation: string, args: unknown, signal: AbortSignal): Promise<unknown> => {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const finish = (error?: Error, data?: unknown) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        pending.delete(id);
        if (error) reject(error);
        else resolve(data);
      };
      const abort = () => finish(Error('Game request cancelled; observe before retrying.'));
      const timer = setTimeout(
        () =>
          finish(
            Error(
              'Game response timed out; outcome uncertain. Control released. Observe or read the journal before retrying.',
            ),
          ),
        operation === 'game_act' ? 120_000 : 10_000,
      );
      pending.set(id, { tab, finish });
      signal.addEventListener('abort', abort, { once: true });
      send(tab.socket, { type: 'live:request', id, operation, args, sourceId: tab.sourceId, revision: tab.revision });
    });
  };
  const heartbeat = setInterval(() => {
    if (owner) send(owner.tab.socket, { type: 'live:lease' });
  }, 1000);
  heartbeat.unref();

  const api = {
    connect(socket: WebSocket) {
      socket.on('message', (bytes) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(bytes));
        } catch {
          return;
        }
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
        const hello = liveHello.safeParse(raw);
        if (hello.success) {
          const old = tabs.get(socket);
          const next = hello.data;
          if (old && (old.tabId !== next.tabId || old.sourceId !== next.sourceId || old.revision !== next.revision)) {
            invalidate(old, 'The displayed game changed.');
            journal.disconnect(old.tabId);
            tabs.delete(socket);
          }
          if (!tabs.has(socket)) tabs.set(socket, { socket, ...next });
          return;
        }
        const tab = tabs.get(socket);
        if (!tab) return;
        const message = raw as { type?: string };
        if (message.type === 'live:journal') {
          try {
            const result = journal.append(tab, raw);
            send(socket, {
              type: 'live:journal-ack',
              recordingId: (raw as { recordingId: string }).recordingId,
              ...result,
            });
          } catch {
            journal.reject(tab.tabId, 'Invalid journal batch or instance limit reached.');
            send(socket, {
              type: 'live:journal-ack',
              recordingId: (raw as { recordingId: string }).recordingId,
              stopped: 'Invalid journal batch or instance limit reached.',
            });
          }
          return;
        }
        if (message.type === 'live:select') {
          selected = socket;
          return;
        }
        if (message.type === 'live:reclaim') {
          invalidate(tab, 'The creator reclaimed control.');
          return;
        }
        if (message.type === 'live:expired') {
          invalidate(tab, 'Game control heartbeat/lease expired; action outcome uncertain. Observe before retrying.');
          return;
        }
        const result = liveResult.safeParse(raw);
        if (!result.success) return;
        const waiting = pending.get(result.data.id);
        if (waiting?.tab !== tab) return;
        waiting.finish(result.data.error ? Error(result.data.error) : undefined, result.data.data);
      });
      socket.once('close', () => {
        const tab = tabs.get(socket);
        if (tab) {
          invalidate(tab, 'Play tab disconnected.');
          journal.disconnect(tab.tabId);
        }
        tabs.delete(socket);
        if (selected === socket) selected = undefined;
      });
    },
    register(url: string) {
      if (registered && registry.get(registered) === api) registry.delete(registered);
      for (const tab of tabs.values()) {
        invalidate(tab, 'Preview changed.');
        journal.disconnect(tab.tabId);
      }
      selected = undefined;
      registered = url;
      if (url) registry.set(url, api);
    },
    release(task: string) {
      if (owner?.task === task) {
        const tab = owner.tab;
        owner = undefined;
        send(tab.socket, { type: 'live:release' });
        for (const item of pending.values()) if (item.tab === tab) item.finish(Error('Agent task ended.'));
      }
      revoked.delete(task);
    },
    async call(task: string, name: LiveToolName, raw: unknown, signal: AbortSignal) {
      signal.throwIfAborted();
      if (name === 'game_journal') {
        liveArguments.game_journal.parse(raw);
        return { data: journal.status() };
      }
      if (name === 'game_journal_read') return { data: journal.read(liveArguments.game_journal_read.parse(raw)) };
      const args = liveArguments[name].parse(raw);
      signal.throwIfAborted();
      if (name === 'game_release_control' && owner?.task !== task)
        return { data: { released: true, alreadyReleased: true } };
      if (busy) throw Error('Another live game operation is running.');
      if (name === 'game_act') {
        const { actions } = liveArguments.game_act.parse(raw);
        if (actions.reduce((sum, a) => sum + ('frames' in a ? a.frames : 1), 0) > 600)
          throw Error('Limit each action batch to 600 frames.');
      }
      const candidates = available();
      const tab = args.tabId
        ? candidates.find((t) => t.tabId === args.tabId)
        : ((owner?.task === task ? owner.tab : undefined) ??
          candidates.find((t) => t.socket === selected) ??
          (candidates.length === 1 ? candidates[0] : undefined));
      if (!tab)
        throw Error(
          'Select an open Play tab. Available tabs: ' +
            JSON.stringify(candidates.map(({ tabId, revision }) => ({ tabId, revision }))),
        );
      if (name !== 'game_observe' && revoked.has(task))
        throw Error('Control was revoked for this task. Ask the creator to start a new request.');
      if (owner && (owner.task !== task || owner.tab !== tab)) throw Error('Another task or tab owns game control.');
      if (name === 'game_act' && !owner) throw Error('Call game_take_control first.');
      if (name === 'game_take_control') owner = { task, tab };
      busy = true;
      try {
        const data = await request(tab, name, args, signal);
        if (name === 'game_release_control') owner = undefined;
        return { tabId: tab.tabId, revision: tab.revision, data };
      } catch (error) {
        invalidate(tab, 'Live operation stopped.');
        throw error;
      } finally {
        busy = false;
      }
    },
    close() {
      api.register('');
      for (const item of pending.values()) item.finish(Error('Play ended.'));
      clearInterval(heartbeat);
      tabs.clear();
      revoked.clear();
      journal.close();
    },
  };
  return api;
}
