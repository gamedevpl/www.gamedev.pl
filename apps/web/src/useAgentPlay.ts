// Host state for agent play mode; see docs/agent-play-mode.md.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { postGameHostMessage } from './gamePlayer.js';
import { parseAgentCommand, type AgentAffordance, type AgentSnapshot } from './agentPlay.js';

// One line of what happened while the agent was not looking.
export type AgentLogEntry = { frame: number; kind: string; detail: string };

export type AgentHello = {
  title: string;
  desc: string;
  hint: string;
  controlRows: Array<{ keys: string; action: string }>;
  fps: number;
  // False on an older document: stepping is then unavailable.
  harness: boolean;
};

export type AgentState = {
  reason: string;
  frame: number;
  snapshot: AgentSnapshot;
  ui: AgentAffordance[];
  // null means the document declared no hidden fields.
  hiddenFields: string[] | null;
  log: AgentLogEntry[];
  stepped: boolean;
};

// What the console shows after a Run.
export type AgentHistoryEntry = { n: number; command: string; ok: boolean; output: string };

const HISTORY_CAP = 30;
const LOG_CAP = 60;

function asString(value: unknown, max = 200): string {
  return String(value ?? '').slice(0, max);
}

function readAffordances(value: unknown): AgentAffordance[] {
  if (!Array.isArray(value)) return [];
  const out: AgentAffordance[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const widget = raw as Record<string, unknown>;
    const numbers = ['x1', 'y1', 'x2', 'y2'].map((key) => Number(widget[key]));
    if (numbers.some((value) => !Number.isFinite(value))) continue;
    out.push({
      label: asString(widget.label, 80),
      enabled: Boolean(widget.enabled),
      ...(typeof widget.detail === 'string' ? { detail: asString(widget.detail, 120) } : {}),
      ...(widget.selected === true ? { selected: true } : {}),
      x1: numbers[0]!,
      y1: numbers[1]!,
      x2: numbers[2]!,
      y2: numbers[3]!,
    });
  }
  return out.slice(0, 80);
}

// Primitives only: a hostile frame cannot send an object graph.
function readSnapshot(value: unknown): AgentSnapshot {
  if (!value || typeof value !== 'object') return {};
  const out: AgentSnapshot = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = typeof raw === 'string' ? raw.slice(0, 2000) : raw;
    }
  }
  return out;
}

function readLog(value: unknown): AgentLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      frame: Number(entry.frame) || 0,
      kind: asString(entry.kind, 24),
      detail: asString(entry.detail, 160),
    }))
    .slice(-LOG_CAP);
}

export function useAgentPlay(frameRef: MutableRefObject<HTMLIFrameElement | null>, active: boolean) {
  const [hello, setHello] = useState<AgentHello | null>(null);
  const [state, setState] = useState<AgentState | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [history, setHistory] = useState<AgentHistoryEntry[]>([]);
  const [signals, setSignals] = useState<AgentLogEntry[]>([]);
  const nextEntry = useRef(1);
  const lastLoadId = useRef<unknown>(undefined);

  useEffect(() => {
    if (!active) {
      setHello(null);
      setState(null);
      setShot(null);
      setSignals([]);
      return;
    }

    function onMessage(event: MessageEvent) {
      // Same guards as the player bridge: opaque origin, this frame.
      if (event.origin !== 'null') return;
      if (event.source !== null && event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.source !== 'gdpl-player') return;
      // New document: its enable retries are long over, so ask again.
      if (data.loadId !== lastLoadId.current) {
        const first = lastLoadId.current === undefined;
        lastLoadId.current = data.loadId;
        setSignals([]);
        if (!first) {
          setState(null);
          setShot(null);
          postGameHostMessage(frameRef.current, { type: 'agent:enable' });
        }
      }

      if (data.type === 'agent:hello') {
        const controls = (data.controls ?? {}) as Record<string, unknown>;
        const rows = Array.isArray(controls.rows) ? controls.rows : [];
        setHello({
          title: asString(data.title, 120),
          desc: asString(data.desc, 400),
          hint: asString(controls.hint, 300),
          controlRows: rows
            .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
            .map((row) => ({ keys: asString(row.keys, 60), action: asString(row.action, 120) }))
            .filter((row) => row.keys || row.action)
            .slice(0, 20),
          fps: Number(data.fps) || 60,
          harness: Boolean(data.harness),
        });
        return;
      }
      if (data.type === 'agent:state') {
        setState({
          reason: asString(data.reason, 24),
          frame: Number(data.frame) || 0,
          snapshot: readSnapshot(data.snapshot),
          ui: readAffordances(data.ui),
          hiddenFields: Array.isArray(data.hiddenFields) ? data.hiddenFields.map((f) => asString(f, 60)) : null,
          log: readLog(data.log),
          stepped: Boolean(data.stepped),
        });
        return;
      }
      if (data.type === 'agent:shot') {
        setShot(typeof data.png === 'string' && data.png.length > 0 ? data.png : null);
        return;
      }
      // Play signals that predate agent mode, folded into the log.
      const frame = Number(data.frame) || 0;
      if (data.type === 'progress' && data.label) {
        setSignals((prev) => [...prev, { frame, kind: 'progress', detail: asString(data.label, 60) }].slice(-LOG_CAP));
      } else if (data.type === 'score') {
        setSignals((prev) => [...prev, { frame, kind: 'score', detail: asString(data.value, 24) }].slice(-LOG_CAP));
      } else if (data.type === 'end') {
        setSignals((prev) => [...prev, { frame, kind: 'end', detail: asString(data.outcome, 24) }].slice(-LOG_CAP));
      } else if (data.type === 'error' && data.message) {
        setSignals((prev) => [...prev, { frame, kind: 'error', detail: asString(data.message, 160) }].slice(-LOG_CAP));
      }
    }

    // Captured once so cleanup reaches the frame this effect enabled.
    const frame = frameRef.current;
    window.addEventListener('message', onMessage);
    postGameHostMessage(frame, { type: 'agent:enable' });
    // The bridge may still be booting; nudge, as the player hook does.
    let tries = 0;
    const timer = window.setInterval(() => {
      postGameHostMessage(frameRef.current, { type: 'agent:enable' });
      if (++tries >= 4) window.clearInterval(timer);
    }, 300);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
      postGameHostMessage(frame, { type: 'agent:disable' });
    };
  }, [active, frameRef]);

  // Parse errors never reach the frame; they come back as failed entries.
  const run = useCallback(
    (line: string): AgentHistoryEntry | null => {
      const n = nextEntry.current++;
      let entry: AgentHistoryEntry;
      try {
        const command = parseAgentCommand(line);
        if (!command) return null;
        postGameHostMessage(frameRef.current, { type: 'agent:command', command });
        entry = { n, command: line.trim(), ok: true, output: `sent: ${command.kind}` };
      } catch (error) {
        entry = {
          n,
          command: line.trim(),
          ok: false,
          output: error instanceof Error ? error.message : 'invalid command',
        };
      }
      setHistory((prev) => [entry, ...prev].slice(0, HISTORY_CAP));
      return entry;
    },
    [frameRef],
  );

  const clearShot = useCallback(() => setShot(null), []);

  return { hello, state, shot, history, signals, run, clearShot };
}
