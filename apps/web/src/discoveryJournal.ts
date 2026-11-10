import { useEffect, useRef, type MutableRefObject } from 'react';
import { isFromGameFrame } from './frameMessage.js';
import { isPlayTimeAccruing } from './telemetry.js';

// Shell half of the opt-in discovery journal; separate from play telemetry.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const PLAYER = 'gdpl-player';
const MAX_LABEL_LENGTH = 40;
// Distinct labels one open may record (API enforces the same).
const MAX_LABELS = 400;
// Labels per flush the API accepts.
const MAX_PER_FLUSH = 50;
const HEARTBEAT_SECONDS = 15;
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

export type DiscoveryFlush = {
  slug: string;
  journalId: string;
  flushMsSinceOpen: number;
  found: { label: string; msSinceOpen: number }[];
  playSeconds?: number;
};

export type DiscoverySend = (body: DiscoveryFlush) => void;

export const sendDiscoveryFlush: DiscoverySend = (body) => {
  void fetch(`${API_BASE}/api/discovery-journal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    keepalive: true,
    body: JSON.stringify(body),
  }).catch(() => {
    // best-effort, like every telemetry send
  });
};

// DOM-free so the caps are testable.
export class DiscoveryJournal {
  private seen = new Set<string>();
  private pending: { label: string; msSinceOpen: number }[] = [];
  private seconds = 0;
  private readonly openedAt: number;

  constructor(
    readonly slug: string,
    readonly journalId: string,
    private readonly send: DiscoverySend = sendDiscoveryFlush,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.openedAt = clock();
  }

  private elapsed(): number {
    return Math.min(MAX_SESSION_MS, Math.max(0, Math.round(this.clock() - this.openedAt)));
  }

  // Records a landmark once per open; returns whether it was new.
  found(raw: unknown): boolean {
    const label = String(raw ?? '')
      .trim()
      .slice(0, MAX_LABEL_LENGTH);
    if (!label || this.seen.has(label) || this.seen.size >= MAX_LABELS) return false;
    this.seen.add(label);
    this.pending.push({ label, msSinceOpen: this.elapsed() });
    return true;
  }

  played(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) this.seconds += Math.round(seconds);
  }

  flush(): void {
    while (this.pending.length > 0 || this.seconds > 0) {
      const found = this.pending.splice(0, MAX_PER_FLUSH);
      const playSeconds = Math.min(600, this.seconds);
      this.seconds -= playSeconds;
      this.send({
        slug: this.slug,
        journalId: this.journalId,
        flushMsSinceOpen: this.elapsed(),
        found,
        ...(playSeconds > 0 ? { playSeconds } : {}),
      });
    }
  }
}

// Keeps a journal while a published game is on stage.
export function useDiscoveryJournal(
  slug: string,
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  enabled: boolean,
  active = true,
) {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!enabled) return;
    const journal = new DiscoveryJournal(slug, crypto.randomUUID());

    function onMessage(event: MessageEvent) {
      if (!isFromGameFrame(event, frameRef.current)) return;
      const data = event.data as { source?: string; type?: string; label?: unknown };
      if (!data || data.source !== PLAYER || data.type !== 'progress') return;
      journal.found(data.label);
    }
    window.addEventListener('message', onMessage);

    const timer = window.setInterval(() => {
      if (activeRef.current && isPlayTimeAccruing(document)) journal.played(HEARTBEAT_SECONDS);
      journal.flush();
    }, HEARTBEAT_SECONDS * 1000);

    function onHide() {
      if (document.visibilityState === 'hidden') journal.flush();
    }
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onHide);
      journal.flush();
    };
  }, [slug, enabled, frameRef]);
}
