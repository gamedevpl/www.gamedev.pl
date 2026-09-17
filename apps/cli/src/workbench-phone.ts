import { isJsonContentType } from './workbench-http.js';
import QRCode from 'qrcode';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PHONE_PAGE } from './workbench-phone-page.js';

export function lanAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter(
        (e) => !e.internal && e.family === 'IPv4' && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(e.address),
      )
      .map((e) => e.address),
  );
}
const reportSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1).max(8000),
    revision: z.string().max(100),
    png: z.string().max(2_000_000).optional(),
    diagnostics: z.string().max(200_000).optional(),
  })
  .strict();
export type PhoneReport = { id: string; text: string; revision: string; capturedAt: string; attachments: string[] };
export async function startPhonePreview(input: {
  address: string;
  snapshot: () => Promise<unknown>;
  status: () => Promise<unknown>;
  artifact: (value: unknown) => { id: string };
  reports: PhoneReport[];
}) {
  if (!lanAddresses().includes(input.address)) throw Error('Select a current private LAN address');
  const secret = randomBytes(32).toString('hex');
  let origin = '';
  const receipts = new Map<string, string>();
  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader(
      'content-security-policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; frame-src about:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const reply = (code: number, value: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (
      !origin ||
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin !== undefined && req.headers.origin !== origin) ||
      (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(req.headers['sec-fetch-site'])))
    ) {
      reply(403, { error: 'Forbidden' });
      return;
    }
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' });
      res.end(PHONE_PAGE);
      return;
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      reply(401, { error: 'Pairing expired or revoked' });
      return;
    }
    try {
      if (req.method === 'GET' && req.url === '/game') {
        reply(200, await input.snapshot());
        return;
      }
      if (req.method === 'GET' && req.url === '/status') {
        reply(200, await input.status());
        return;
      }
      if (
        req.method === 'POST' &&
        req.url === '/report' &&
        req.headers.origin === origin &&
        isJsonContentType(req.headers['content-type'])
      ) {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 2_210_000) throw Error('Report too large');
          chunks.push(Buffer.from(chunk));
        }
        const value = reportSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        const fingerprint = JSON.stringify(value),
          previous = receipts.get(value.id);
        if (previous) {
          reply(previous === fingerprint ? 200 : 409, { accepted: previous === fingerprint });
          return;
        }
        if (receipts.size >= 50 || input.reports.length >= 50) throw Error('Report limit reached');
        const capturedAt = new Date().toISOString(),
          attachments: string[] = [];
        for (const [data, mime, name] of [
          [value.png, 'image/png', 'phone.png'],
          [
            value.diagnostics && Buffer.from(value.diagnostics).toString('base64'),
            'application/json',
            'phone-trace.json',
          ],
        ]) {
          if (data)
            attachments.push(
              input.artifact({
                data,
                mime,
                name,
                purpose: 'diagnostic',
                revision: value.revision,
                device: 'phone',
                capturedAt,
              }).id,
            );
        }
        input.reports.push({ id: randomUUID(), text: value.text, revision: value.revision, capturedAt, attachments });
        receipts.set(value.id, fingerprint);
        reply(200, { accepted: true });
        return;
      }
      reply(404, { error: 'Read-only player; editor commands are unavailable' });
    } catch {
      reply(400, { error: 'Report or preview unavailable' });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 16;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, input.address, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(Error('No listener'));
        return;
      }
      origin = `http://${input.address}:${address.port}`;
      resolve();
    });
  });
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(expiry);
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  };
  const expiry = setTimeout(() => void close(), 30 * 60_000);
  expiry.unref();
  const url = `${origin}/#${secret}`;
  try {
    return { url, expiresAt, close, qr: await QRCode.toDataURL(url, { width: 240, margin: 1 }) };
  } catch (error) {
    await close();
    throw error;
  }
}
