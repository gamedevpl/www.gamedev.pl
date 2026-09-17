import { progressTool, progressReporter } from './local-progress.js';
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { captureBrowser, type CaptureImage, type CaptureViewport } from './local-capture-browser.js';
import { capturePage, CAPTURE_CSP, previewSource } from './local-preview-source.js';

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
});
const TOOLS = [
  tool(
    'preview_status',
    'Get current local game build status. Build errors mean screenshots cannot verify current edits.',
  ),
  tool(
    'capture',
    'Capture this game only. Returns a job ID; call capture_status to receive its PNG image and rendered revision. No source or published media is changed.',
    { viewport: { type: 'string', enum: ['desktop', 'mobile'] } },
  ),
  tool(
    'capture_status',
    'Get capture progress or its PNG image. Wait briefly between polls. Inspect the image before claiming visual verification.',
    { jobId: { type: 'string' } },
    ['jobId'],
  ),
];
type Job = {
  id: string;
  state: 'building' | 'capturing' | 'complete' | 'failed';
  revision?: string;
  image?: CaptureImage;
  error?: string;
  startedAt: string;
};
const text = (value: unknown) => ({ type: 'text', text: JSON.stringify(value) });

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of request) {
    const chunk = Buffer.from(raw as Buffer);
    size += chunk.length;
    if (size > 8192) throw new Error('Request exceeds 8 KiB.');
    chunks.push(chunk);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString());
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected JSON-RPC object.');
  return parsed as Record<string, unknown>;
}

export async function startLocalPreviewMcp(input: {
  previewUrl?: string;
  progress?: (text: string, blocked: boolean) => void;
  abort: AbortSignal;
  write: (line: string) => void;
  capture?: typeof captureBrowser;
}) {
  const controller = new AbortController();
  const signal = AbortSignal.any([input.abort, controller.signal]);
  const source = input.previewUrl ? previewSource(input.previewUrl, signal) : undefined;
  const report = progressReporter(input.progress ?? ((text) => input.write(text)));
  const key = randomBytes(32).toString('hex');
  const renderKey = randomBytes(32).toString('hex');
  const jobs = new Map<string, Job>();
  let current: Promise<void> | undefined;
  let render: { id: string; html: string } | undefined;
  let origin = '';
  let lastStarted = 0;
  async function execute(job: Job, viewport: CaptureViewport): Promise<void> {
    try {
      input.write('Local capture: waiting for the current build…');
      const snapshot = await source!.snapshot();
      signal.throwIfAborted();
      job.revision = snapshot.revision;
      job.state = 'capturing';
      render = { id: job.id, html: capturePage(snapshot.html) };
      input.write('Local capture: taking a screenshot…');
      job.image = await (input.capture ?? captureBrowser)({
        url: `${origin}/${renderKey}/${job.id}`,
        viewport,
        signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
      });
      job.state = 'complete';
      input.write(`Local capture ready (${viewport}, build ${snapshot.revision.slice(0, 12)}).`);
    } catch (error) {
      job.state = 'failed';
      job.error = (error instanceof Error ? error.message : 'Capture failed.').slice(0, 2500);
      input.write(`Local capture failed: ${job.error}`);
    } finally {
      render = undefined;
    }
  }
  async function call(name: unknown, raw: unknown) {
    const args = raw ?? {};
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid arguments.');
    const value = args as Record<string, unknown>;
    const keys = Object.keys(value);
    if (name === 'report_progress') return { content: [text(report(value))] };
    if (!source) throw new Error('No local preview is available.');
    if (name === 'preview_status' && keys.length === 0) return { content: [text(await source.status())] };
    if (name === 'capture' && keys.every((item) => item === 'viewport')) {
      const viewport = value.viewport ?? 'desktop';
      if (viewport !== 'desktop' && viewport !== 'mobile') throw new Error('Unknown viewport.');
      if (current) throw new Error('A capture is already running. Use capture_status.');
      if (Date.now() - lastStarted < 2000) throw new Error('Wait two seconds before another capture.');
      lastStarted = Date.now();
      while (jobs.size >= 3) jobs.delete(jobs.keys().next().value!);
      const job: Job = { id: randomUUID(), state: 'building', startedAt: new Date().toISOString() };
      jobs.set(job.id, job);
      current = execute(job, viewport).finally(() => {
        current = undefined;
      });
      return { content: [text({ jobId: job.id, state: job.state, pollAfterMs: 1000 })] };
    }
    if (name === 'capture_status' && keys.length === 1 && typeof value.jobId === 'string') {
      const job = jobs.get(value.jobId);
      if (!job) throw new Error('Unknown or expired capture job.');
      return {
        content: [
          text({
            jobId: job.id,
            state: job.state,
            revision: job.revision,
            startedAt: job.startedAt,
            error: job.error,
            consoleErrors: job.image?.errors,
            pollAfterMs: job.image || job.error ? undefined : 1000,
          }),
          ...(job.image ? [{ type: 'image', mimeType: 'image/png', data: job.image.png }] : []),
        ],
        isError: job.state === 'failed',
      };
    }
    throw new Error('Unknown local tool or unexpected arguments.');
  }
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (
      !origin ||
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin)
    ) {
      response.writeHead(403).end();
      return;
    }
    if (request.method === 'GET' && render && request.url === `/${renderKey}/${render.id}`) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Content-Security-Policy', CAPTURE_CSP);
      response.end(render.html);
      return;
    }
    if (request.url !== '/mcp' || request.headers.authorization !== `Bearer ${key}`) {
      response.writeHead(403).end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405).end();
      return;
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      response.writeHead(415).end();
      return;
    }
    let id: unknown = null;
    try {
      const message = await body(request);
      id = message.id ?? null;
      if (
        message.jsonrpc !== '2.0' ||
        typeof message.method !== 'string' ||
        (id !== null && typeof id !== 'string' && typeof id !== 'number')
      )
        throw new Error('Invalid JSON-RPC request.');
      if (message.method.startsWith('notifications/')) {
        response.writeHead(202).end();
        return;
      }
      let result: unknown;
      if (message.method === 'initialize') {
        result = {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'gamedevpl-local', version: '1.0.0' },
        };
      } else if (message.method === 'ping') result = {};
      else if (message.method === 'tools/list') result = { tools: [progressTool, ...(source ? TOOLS : [])] };
      else if (message.method === 'tools/call') {
        const params = message.params as { name?: unknown; arguments?: unknown } | undefined;
        try {
          result = await call(params?.name, params?.arguments);
        } catch (error) {
          result = {
            isError: true,
            content: [text({ error: error instanceof Error ? error.message : 'Tool failed.' })],
          };
        }
      } else throw new Error('Unsupported method.');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32600, message: error instanceof Error ? error.message : 'Invalid request.' },
        }),
      );
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 8;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const stop = (): void => {
    controller.abort();
    server.closeAllConnections();
    server.close();
  };
  input.abort.addEventListener('abort', stop, { once: true });
  if (input.abort.aborted) stop();
  return {
    url: `${origin}/mcp`,
    authorization: `Bearer ${key}`,
    async close() {
      input.abort.removeEventListener('abort', stop);
      stop();
      await current;
      jobs.clear();
    },
  };
}
