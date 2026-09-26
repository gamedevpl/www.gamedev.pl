import { createSocket } from 'node:dgram';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { captureBrowser } from './local-capture-browser.js';

it.runIf(process.env.GAMEDEV_CAPTURE_BROWSER_TEST === '1')(
  'blocks peer connections in real capture documents',
  async () => {
    const udp = createSocket('udp4');
    let packets = 0;
    udp.on('message', () => packets++);
    udp.bind(0, '127.0.0.1');
    await once(udp, 'listening');
    const stunPort = udp.address().port;
    let tcpConnections = 0;
    const tcp = createTcpServer((socket) => {
      tcpConnections++;
      socket.destroy();
    });
    tcp.listen(0, '127.0.0.1');
    await once(tcp, 'listening');
    const tcpAddress = tcp.address();
    if (!tcpAddress || typeof tcpAddress === 'string') throw new Error('Missing TURN listener');
    const turnPort = tcpAddress.port;
    const probe = `
    let blocked = false;
    try {
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${stunPort}' }, { urls: 'turn:127.0.0.1:${turnPort}?transport=tcp', username: 'fixture', credential: 'fixture' }] });
      peer.createDataChannel('capture-test');
      peer.createOffer().then(offer => peer.setLocalDescription(offer));
    } catch { blocked = true; }
    parent.postMessage({ captureProbe: true, blocked }, '*');
  `;
    const child = `<body style="background:#23aa77">Game capture<script>${probe}</script>`;
    const html = `<!doctype html><body><script>
    let childBlocked;
    addEventListener('message', event => {
      if (event.source === game.contentWindow && event.data.captureProbe) { childBlocked = event.data.blocked;
        console.error('CAPTURE_ISOLATION child:' + childBlocked); }
    });
    ${probe}
    console.error('CAPTURE_ISOLATION top:' + blocked);
    const fresh = document.createElement('iframe'); document.body.append(fresh);
    console.error('CAPTURE_ISOLATION fresh:' + (typeof fresh.contentWindow.RTCPeerConnection === 'undefined'));
    const freshProbe = fresh.contentDocument.createElement('script');
    freshProbe.textContent = ${JSON.stringify(probe + "console.error('CAPTURE_ISOLATION freshPeer:' + blocked);").replaceAll('<', '\\u003c')};
    fresh.contentDocument.body.append(freshProbe);
    const game = document.createElement('iframe');
    game.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    game.srcdoc = ${JSON.stringify(child).replaceAll('<', '\\u003c')}; document.body.append(game);
  </script>`;
    const server = createHttpServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'none'",
      );
      response.end(html);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test listener');
      const result = await captureBrowser({
        url: `http://127.0.0.1:${address.port}`,
        viewport: 'desktop',
        signal: AbortSignal.timeout(45000),
      });
      const errors = result.errors.join(' ');
      expect(packets, errors + ' TCP connections: ' + tcpConnections).toBe(0);
      expect(tcpConnections).toBe(0);
      expect(errors).toContain('CAPTURE_ISOLATION top:false');
      expect(errors).toContain('CAPTURE_ISOLATION child:false');
      expect(errors).toContain('CAPTURE_ISOLATION fresh:false');
      expect(errors).toContain('CAPTURE_ISOLATION freshPeer:false');
      expect(Buffer.from(result.png, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      udp.close();
      await new Promise<void>((resolve) => tcp.close(() => resolve()));
    }
  },
  60000,
);
