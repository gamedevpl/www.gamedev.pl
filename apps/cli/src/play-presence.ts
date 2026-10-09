import type { IncomingMessage, Server } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { setTimeout as delay } from 'node:timers/promises';

export const PLAY_IDLE_MS = 60_000;

export function playPresence(onIdle?: () => void, canStop = () => true) {
  const clients = new Map<WebSocket, boolean>();
  let emptySince: number | undefined;
  let closed = false;
  let lastPulse = Date.now();
  const timer = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    if (now - lastPulse >= 15_000) {
      lastPulse = now;
      for (const [client, alive] of clients) {
        if (!alive) client.terminate();
        else {
          clients.set(client, false);
          client.ping();
        }
      }
    }
    if (emptySince !== undefined && now - emptySince >= PLAY_IDLE_MS && canStop()) {
      emptySince = undefined;
      onIdle?.();
    }
  }, 1000);
  timer.unref();
  return {
    get connected() {
      return clients.size > 0;
    },
    connect(client: WebSocket) {
      if (closed) {
        client.terminate();
        return;
      }
      clients.set(client, true);
      emptySince = undefined;
      client.on('pong', () => {
        if (clients.has(client)) clients.set(client, true);
      });
      client.once('close', () => {
        clients.delete(client);
        if (!clients.size) emptySince = Date.now();
      });
    },
    close() {
      closed = true;
      clearInterval(timer);
      for (const client of clients.keys()) client.terminate();
      clients.clear();
    },
  };
}

export function presenceToken(request: IncomingMessage, token: string): boolean {
  return (
    request.headers.authorization === `Bearer ${token}` ||
    request.headers['sec-websocket-protocol']
      ?.split(',')
      .map((value) => value.trim())
      .includes(`token.${token}`) === true
  );
}

export function attachPlayPresence(
  server: Server,
  presence: Pick<ReturnType<typeof playPresence>, 'connect'>,
  authorize: (request: IncomingMessage) => boolean,
) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on('upgrade', (request, socket, head) => {
    if (!authorize(request)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => {
      client.on('error', () => client.terminate());
      presence.connect(client);
    });
  });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const client of sockets.clients) client.terminate();
    sockets.close();
  };
  server.once('close', close);
  return close;
}

export async function holdPreview(url: string, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    const socket = new WebSocket(`${url}presence`.replace(/^http:/, 'ws:'), { handshakeTimeout: 5000 });
    let unavailable = false;
    const abort = () => socket.terminate();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    await new Promise<void>((resolve) => {
      socket.on('error', (error) => {
        unavailable =
          (error as NodeJS.ErrnoException).code === 'ECONNREFUSED' || /Unexpected server response/.test(error.message);
      });
      socket.once('close', resolve);
    });
    signal.removeEventListener('abort', abort);
    if (unavailable) return;
    await delay(1000, undefined, { signal }).catch(() => undefined);
  }
}
