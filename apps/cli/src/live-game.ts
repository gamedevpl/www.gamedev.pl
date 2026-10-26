import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { liveArguments, liveHello, liveResult, type LiveToolName } from './live-game-protocol.js';
import { createJournalStore } from './live-journal-store.js';
import { createLiveCodeStore } from './live-code-store.js';
import { hotTransitionMessage, hotTransitions } from './live-hot-transitions.js';

type Tab = {
  socket: WebSocket;
  tabId: string;
  sourceId: number;
  revision: string;
  buildEpoch?: number;
  instanceId?: string;
};
type Pending = { tab: Tab; finish(error?: Error, data?: unknown): void };
const registry = new Map<string, LiveGame>();
export type LiveGame = ReturnType<typeof createLiveGame>;

export function findLiveGame(url: string | undefined) {
  return url ? registry.get(url) : undefined;
}

export function createLiveGame(currentSource: () => number) {
  const code = createLiveCodeStore();
  const journal = createJournalStore(undefined, code.describe);
  const tabs = new Map<WebSocket, Tab>();
  const instances = new Map<string, Tab>();
  const pending = new Map<string, Pending>();
  let registered = '';
  let selected: WebSocket | undefined;
  let owner: { task: string; tab: Tab; needsObservation?: boolean } | undefined;
  const updates = new Map<Tab, string>();
  const transitions = new Map<Tab, ReturnType<typeof hotTransitions>>();
  const segments = new Map<string, { tabId: string; sourceId: number; revision: string }>();
  const builds = new Set<string>();
  const previousHello = new Map<Tab, string>();
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
    retainBuild(sourceId: number, snapshot: { revision: string; html: string }) {
      builds.add(`${sourceId}:${snapshot.revision}`);
      if (builds.size > 256) builds.delete(builds.values().next().value!);
      return code.retain({ sourceId, revision: snapshot.revision }, snapshot.html);
    },
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
          if (old && old.tabId === next.tabId && old.sourceId === next.sourceId && old.instanceId === next.instanceId) {
            if (previousHello.get(old) === next.revision) return;
            if (old.revision === next.revision) previousHello.delete(old);
          }
          if (
            old &&
            (old.tabId !== next.tabId ||
              old.sourceId !== next.sourceId ||
              old.revision !== next.revision ||
              old.instanceId !== next.instanceId)
          ) {
            updates.delete(old);
            previousHello.delete(old);
            invalidate(old, 'The displayed game changed.');
            journal.disconnect(old.tabId);
            tabs.delete(socket);
          }
          if (!tabs.has(socket)) {
            const retained = next.instanceId ? instances.get(next.instanceId) : undefined;
            const prepared = retained ? transitions.get(retained)?.pending() : undefined;
            if (
              retained &&
              retained.tabId === next.tabId &&
              retained.sourceId === next.sourceId &&
              [retained.revision, previousHello.get(retained), prepared?.revision].includes(next.revision)
            ) {
              if (retained.socket !== socket && tabs.has(retained.socket)) {
                invalidate(retained, 'Play connection replaced.');
                tabs.delete(retained.socket);
              }
              retained.socket = socket;
              tabs.set(socket, retained);
              if (prepared) updates.set(retained, prepared.id);
            } else {
              const tab = { socket, ...next };
              tabs.set(socket, tab);
              if (next.instanceId && (instances.has(next.instanceId) || instances.size < 256))
                instances.set(next.instanceId, tab);
            }
          }
          return;
        }
        const tab = tabs.get(socket);
        if (!tab) return;
        const message = raw as { type?: string };
        if (message.type === 'live:hot') {
          const parsed = hotTransitionMessage.safeParse(raw);
          if (!parsed.success) return;
          const m = parsed.data;
          let history = transitions.get(tab);
          if (!history) {
            history = hotTransitions();
            transitions.set(tab, history);
          }
          try {
            let transaction = history.get(m.id);
            if (m.phase === 'begin') {
              if (!transaction) {
                if (tab.instanceId && instances.get(tab.instanceId) !== tab)
                  throw Error('HMR runtime history capacity reached; restart Play.');
                if (busy || updates.size) throw Error('Wait for the current live operation or update to finish.');
                if (
                  tab.sourceId !== currentSource() ||
                  m.sourceId !== tab.sourceId ||
                  m.previousRevision !== tab.revision ||
                  m.expectedEpoch !== (tab.buildEpoch ?? 0) ||
                  !builds.has(`${tab.sourceId}:${m.revision}`)
                )
                  throw Error('Displayed source, build or epoch changed.');
              }
              transaction = history.begin(m);
              if (transaction.state === 'prepared') updates.set(tab, m.id);
            } else if (!transaction) throw Error('Unknown update transaction.');
            else if (m.phase === 'abort' && transaction.state === 'prepared') {
              transaction.state = 'aborted';
              updates.delete(tab);
            } else if (m.phase === 'finish' && transaction.state === 'prepared') {
              if (updates.get(tab) !== m.id) throw Error('Update lease expired or was revoked.');
              transaction = history.finish(transaction, m);
              updates.delete(tab);
              if (transaction.state === 'committed') {
                segments.set(m.previousRecordingId, {
                  tabId: tab.tabId,
                  sourceId: tab.sourceId,
                  revision: transaction.previousRevision,
                });
                segments.set(m.recordingId, {
                  tabId: tab.tabId,
                  sourceId: tab.sourceId,
                  revision: transaction.revision,
                });
                previousHello.set(tab, tab.revision);
                tab.revision = transaction.revision;
                tab.buildEpoch = m.epoch;
                if (owner?.tab === tab) owner.needsObservation = true;
              }
            }
            send(socket, { type: 'live:hot-result', id: m.id, transaction });
          } catch (error) {
            send(socket, { type: 'live:hot-result', id: m.id, error: String(error) });
          }
          return;
        }
        if (message.type === 'live:journal') {
          try {
            const binding = segments.get((raw as { recordingId: string }).recordingId);
            const result = journal.append(
              binding?.tabId === tab.tabId && binding.sourceId === tab.sourceId ? binding : tab,
              raw,
            );
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
          updates.delete(tab);
          invalidate(tab, 'Play tab disconnected.');
          journal.disconnect(tab.tabId);
        }
        tabs.delete(socket);
        if (tab && !tab.instanceId) {
          transitions.get(tab)?.clear();
          transitions.delete(tab);
        }
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
      updates.clear();
      previousHello.clear();
      registered = url;
      if (url) registry.set(url, api);
    },
    release(task: string, { taskEnded = true }: { taskEnded?: boolean } = {}) {
      if (owner?.task === task) {
        const tab = owner.tab;
        owner = undefined;
        send(tab.socket, { type: 'live:release' });
        for (const item of pending.values())
          if (item.tab === tab)
            item.finish(Error(taskEnded ? 'Agent task ended.' : 'Script control released; observe before retrying.'));
      }
      if (taskEnded) revoked.delete(task);
    },
    async call(task: string, name: LiveToolName, raw: unknown, signal: AbortSignal) {
      signal.throwIfAborted();
      if (name === 'game_journal') {
        liveArguments.game_journal.parse(raw);
        return { data: { ...journal.status(), codeArchive: code.status() } };
      }
      if (name === 'game_journal_read') return { data: journal.read(liveArguments.game_journal_read.parse(raw)) };
      if (name === 'game_journal_code') {
        const query = liveArguments.game_journal_code.parse(raw);
        return { data: { recordingId: query.recordingId, ...code.read(journal.source(query.recordingId), query) } };
      }
      const args = liveArguments[name].parse(raw);
      signal.throwIfAborted();
      if (name === 'game_release_control' && owner?.task !== task)
        return { data: { released: true, alreadyReleased: true } };
      if (name === 'game_release_control' && owner?.task === task && updates.has(owner.tab)) {
        const tab = owner.tab;
        owner = undefined;
        send(tab.socket, { type: 'live:release' });
        return { tabId: tab.tabId, revision: tab.revision, data: { released: true } };
      }
      if (busy || updates.size) throw Error('Another live game operation or update is running.');
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
      if (name === 'game_act' && owner?.needsObservation) throw Error('Code changed; call game_observe before acting.');
      if (name === 'game_take_control') owner = { task, tab };
      busy = true;
      try {
        const data = await request(tab, name, args, signal);
        if (name === 'game_observe' && owner?.task === task && owner.tab === tab) owner.needsObservation = false;
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
      instances.clear();
      revoked.clear();
      updates.clear();
      transitions.clear();
      segments.clear();
      builds.clear();
      journal.close();
      code.close();
    },
  };
  return api;
}
