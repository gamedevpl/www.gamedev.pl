import type { ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

export const PLAY_IDLE_MS = 60_000;

export function playPresence(onIdle?: () => void, canStop = () => true) {
  const clients = new Set<ServerResponse>();
  let emptySince: number | undefined;
  let closed = false;
  let lastPulse = Date.now();
  const timer = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    if (now - lastPulse >= 15_000) {
      lastPulse = now;
      for (const client of clients) client.write(': alive\n\n');
    }
    if (emptySince !== undefined && now - emptySince >= PLAY_IDLE_MS && canStop()) {
      emptySince = undefined;
      onIdle?.();
    }
  }, 1000);
  timer.unref();
  return {
    connect(response: ServerResponse) {
      if (closed) {
        response.writeHead(503);
        response.end();
        return;
      }
      clients.add(response);
      emptySince = undefined;
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      response.write(': connected\n\n');
      response.once('close', () => {
        clients.delete(response);
        if (!clients.size) emptySince = Date.now();
      });
    },
    close() {
      closed = true;
      clearInterval(timer);
      for (const client of clients) client.end();
      clients.clear();
    },
  };
}

export async function holdPreview(url: string, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const response = await fetch(`${url}presence`, { signal, redirect: 'error' });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return;
      }
      const reader = response.body.getReader();
      try {
        while (!(await reader.read()).done) signal.throwIfAborted();
      } finally {
        await reader.cancel();
      }
    } catch (error) {
      if (signal.aborted) return;
      if ((error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') return;
    }
    await delay(1000, undefined, { signal }).catch(() => undefined);
  }
}
