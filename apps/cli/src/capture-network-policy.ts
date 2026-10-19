import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { once } from 'node:events';

export async function captureNetworkPolicy(rawUrl: string, gameUrl?: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password)
    throw new Error('Capture requires its local loopback document.');
  const allowed = [url];
  if (gameUrl) {
    const game = new URL(gameUrl);
    if (game.origin !== url.origin || game.username || game.password)
      throw new Error('Capture game document must use the capture server origin.');
    allowed.push(game);
  }
  const server = createServer((incoming, response) => {
    const target = allowed.find((document) => document.href === incoming.url);
    if (incoming.method !== 'GET' || !target || incoming.headers.host !== url.host) {
      response.writeHead(403).end();
      return;
    }
    const upstream = request(target, { method: 'GET' }, (received) => {
      response.writeHead(received.statusCode ?? 502, received.headers);
      received.pipe(response);
    });
    upstream.on('error', () => response.destroy());
    response.on('close', () => upstream.destroy());
    upstream.end();
  });
  server.on('connect', (_request, socket) => socket.destroy());
  server.on('upgrade', (_request, socket) => socket.destroy());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Capture proxy did not bind.');
  return {
    flags: [
      `--proxy-server=http://127.0.0.1:${address.port}`,
      '--proxy-bypass-list=<-loopback>',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
    prepareProfile: (profile: string) => {
      mkdirSync(join(profile, 'Default'));
      writeFileSync(
        join(profile, 'Default', 'Preferences'),
        JSON.stringify({
          webrtc: { ip_handling_policy: 'disable_non_proxied_udp', ip_handling_urls: [], local_ips_allowed_urls: [] },
        }),
        { mode: 0o600 },
      );
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
