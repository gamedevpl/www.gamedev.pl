import { isJsonContentType } from './workbench-http.js';
import { EVIDENCE_MARKER } from './workbench-evidence.js';
import { lanAddresses, startPhonePreview, type PhoneReport } from './workbench-phone.js';
import { embedGameHtml } from '@gamedevpl/contract';
import { WORKBENCH_GAME_BRIDGE } from './workbench-game-bridge.js';
import { workbenchArtifacts } from './workbench-artifacts.js';
import { workbenchActionSchema, WORKBENCH_ACTIONS } from './workbench-actions.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { stripVTControlCharacters } from 'node:util';
import { z } from 'zod';
import { createSessionCommands } from './session-commands.js';
import type { SessionController } from './session-controller.js';
import { previewSource } from './local-preview-source.js';
import { SESSION_BROWSER_PAGE } from './session-browser-page.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const generation = z.number();
const command = z.discriminatedUnion('kind', [
  z
    .object({
      id,
      kind: z.literal('input'),
      promptId: generation,
      text: z.string(),
      attachments: z.array(z.string().uuid()).max(8).optional(),
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal('queue'),
      taskId: generation,
      text: z.string(),
      attachments: z.array(z.string().uuid()).max(8).optional(),
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal('action'),
      promptId: generation,
      action: workbenchActionSchema,
      argument: z.string().max(80).optional(),
    })
    .strict(),
  z.object({ id, kind: z.literal('stop'), taskId: generation }).strict(),
]);
const envelope = z.object({ version: z.literal(1), sessionId: z.string().uuid(), command }).strict();
const clean = (text: string) => stripVTControlCharacters(text).slice(-8000);

async function body(req: IncomingMessage, limit = 40_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startSessionBrowser(session: SessionController, options: { detached?: boolean } = {}) {
  const sessionId = randomUUID();
  const token = randomBytes(32).toString('hex');
  const artifacts = workbenchArtifacts();
  const dispatch = createSessionCommands(session, 1024, (ids) => {
    const records = artifacts.resolve(ids);
    return EVIDENCE_MARKER + records.map((r) => JSON.stringify(r)).join('\n');
  });
  let origin = '';
  let sequence = 0;
  let preview: { url: string; abort: AbortController; source: ReturnType<typeof previewSource> } | undefined;
  let sourceId = 0;
  let stopped = false;
  let phone: Awaited<ReturnType<typeof startPhonePreview>> | undefined;
  let phoneOpening = false;
  const reports: PhoneReport[] = [];
  const revokePhone = () => {
    const previous = phone;
    phone = undefined;
    void previous?.close();
  };

  const snapshot = async () => {
    const current = preview,
      currentId = sourceId;
    if (!current) throw Error('No preview');
    const data = await current.source.snapshot();
    if (current !== preview) throw Error('Preview changed');
    return { ...data, html: embedGameHtml(data.html, WORKBENCH_GAME_BRIDGE), sourceId: currentId };
  };
  const unsubscribe = session.subscribe(() => {
    sequence++;
  });
  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader(
      'content-security-policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src 'self'; frame-src about:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const reply = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (
      !origin ||
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin !== undefined && req.headers.origin !== origin) ||
      (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(req.headers['sec-fetch-site'])))
    ) {
      reply(403, { error: 'Forbidden origin' });
      return;
    }
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(SESSION_BROWSER_PAGE);
      return;
    }
    if (req.headers.authorization !== `Bearer ${token}`) {
      reply(401, { error: 'Reconnect from the terminal link' });
      return;
    }
    try {
      if (req.method === 'GET' && req.url === '/state') {
        if (phone?.closed) revokePhone();
        const state = session.get();
        reply(200, {
          version: 1,
          detached: options.detached === true,
          sessionId,
          sequence,
          sourceId,
          hasPreview: Boolean(preview),
          actions: Object.keys(WORKBENCH_ACTIONS),
          actionCommands: WORKBENCH_ACTIONS,
          history: session.savedHistory().prompts.slice(-50).map(clean),
          addresses: lanAddresses(),
          phone: phone && { url: phone.url, expiresAt: phone.expiresAt, qr: phone.qr },
          reports,
          mode: state.mode,
          promptId: state.promptId,
          taskId: state.taskId,
          identity: clean(state.identity),
          activity: clean(state.activity),
          localTask: clean(state.localTask),
          question: clean(state.question),
          choices: state.choices.slice(0, 50).map((value) => ({ label: clean(value), value })),
          lines: state.lines.slice(-200).map(clean),
          live: state.live.map(clean),
          queued: state.queued.map(clean),
        });
        return;
      }
      if (req.method === 'GET' && (req.url === '/preview/status' || req.url === '/preview/game')) {
        const current = preview;
        const currentId = sourceId;
        if (!current) {
          reply(404, { error: 'Start /play in the terminal' });
          return;
        }
        const data = req.url.endsWith('/status') ? await current.source.status() : await current.source.snapshot();
        if (current !== preview) {
          reply(409, { error: 'Preview changed' });
          return;
        }
        reply(200, {
          ...data,
          ...('html' in data ? { html: embedGameHtml(data.html, WORKBENCH_GAME_BRIDGE) } : {}),
          sourceId: currentId,
        });
        return;
      }
      if (req.method === 'POST' && req.url === '/phone') {
        if (req.headers.origin !== origin || !isJsonContentType(req.headers['content-type'])) {
          reply(403, { error: 'JSON and same-origin required' });
          return;
        }
        const command = z
          .object({ address: z.string().optional(), stop: z.boolean().optional() })
          .strict()
          .parse(await body(req));
        if (phoneOpening) {
          reply(409, { error: 'Pairing already in progress' });
          return;
        }
        const pairingSource = preview;
        if (!command.stop && !pairingSource) throw Error('Open a game before pairing');
        phoneOpening = true;
        try {
          await phone?.close();
          phone = undefined;
          if (!command.stop)
            phone = await startPhonePreview({
              address: command.address ?? '',
              snapshot: async () => {
                if (preview !== pairingSource) throw Error('Paired game changed');
                return snapshot();
              },
              status: async () =>
                preview === pairingSource && pairingSource
                  ? pairingSource.source.status()
                  : { error: 'Paired game changed' },
              artifact: artifacts.add,
              reports,
            });
          if (stopped || preview !== pairingSource) {
            await phone?.close();
            phone = undefined;
            reply(409, { error: 'Paired game changed' });
            return;
          }
          reply(200, { url: phone?.url, expiresAt: phone?.expiresAt });
        } finally {
          phoneOpening = false;
        }
        return;
      }
      if (req.method === 'POST' && req.url === '/artifacts') {
        if (req.headers.origin !== origin || !isJsonContentType(req.headers['content-type'])) {
          reply(403, { error: 'JSON and same-origin required' });
          return;
        }
        reply(200, artifacts.add(await body(req, 24_010_000)));
        return;
      }
      if (req.method === 'POST' && req.url === '/commands') {
        if (req.headers.origin !== origin || !isJsonContentType(req.headers['content-type'])) {
          reply(403, { error: 'JSON and same-origin required' });
          return;
        }
        const parsed = envelope.safeParse(await body(req));
        if (!parsed.success) {
          reply(400, { error: 'Invalid command envelope' });
          return;
        }
        if (parsed.data.sessionId !== sessionId) {
          reply(409, { error: 'Session changed' });
          return;
        }
        reply(200, dispatch(parsed.data.command));
        return;
      }
      reply(404, { error: 'Not found' });
    } catch {
      reply(400, { error: 'Request unavailable; refresh state and retry' });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 32;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') return reject(new Error('No session listener'));
        origin = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  } catch (error) {
    unsubscribe();
    artifacts.close();
    throw error;
  }
  return {
    url: `${origin}/#${token}`,
    setSource(key: string, source: ReturnType<typeof previewSource>) {
      if (stopped || preview?.url === key) return;
      revokePhone();
      preview?.abort.abort();
      preview = { url: key, abort: new AbortController(), source };
      sourceId++;
    },
    setPreview(url: string) {
      if (stopped || preview?.url === url) return;
      const abort = new AbortController();
      const source = previewSource(url, abort.signal);
      revokePhone();
      preview?.abort.abort();
      preview = { url, abort, source };
      sourceId++;
    },
    clearPreview() {
      revokePhone();
      preview?.abort.abort();
      preview = undefined;
      sourceId++;
    },
    async close() {
      stopped = true;
      unsubscribe();
      await phone?.close();
      artifacts.close();
      preview?.abort.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
