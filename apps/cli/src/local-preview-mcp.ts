import { progressTool, progressReporter } from './local-progress.js';
import type { ApproveTool } from './agent-approval.js';
import { resolvePermissions, type AgentTask } from 'genaicode/agents';
import { claudeLocalApproval } from './claude-local-approval.js';
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { captureBrowser, type CaptureImage, type CaptureViewport } from './local-capture-browser.js';
import { capturePage, captureGameDocument, CAPTURE_CSP, previewSource } from './local-preview-source.js';
import { selectScenario, type CaptureScenario } from './capture-scenario.js';

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
    'capture_game',
    'Capture the current local game using the CLI host browser. Returns a job ID; poll capture_status for the PNG, console errors and revision. With mark, replay CAPTURE.json up to its first matching capture step. With plan, replay an inline CAPTURE.json scenario; capture the final state, or stop at mark if also supplied. Without either, capture the initial rendered state. No npm scripts, arbitrary JavaScript, file paths or URLs. No sources or published media are changed.',
    {
      viewport: { type: 'string', enum: ['desktop', 'mobile'] },
      mark: {
        type: 'string',
        minLength: 1,
        maxLength: 128,
        description:
          'Name of a capture step. Unknown marks return available names. Uses CAPTURE.json unless plan is supplied.',
      },
      plan: {
        type: 'object',
        additionalProperties: false,
        required: ['script'],
        description:
          'Inline deterministic scenario. Same CAPTURE.json action DSL. Defaults: seed=1, fps=30, maxFrames=3600. Max 2000 expanded actions, 600 simulated seconds, 60 seconds execution. Starts a fresh game; does not continue a previous capture.',
        properties: {
          seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
          fps: { type: 'integer', minimum: 1, maximum: 60 },
          maxFrames: { type: 'integer', minimum: 1, maximum: 36000 },
          script: {
            type: 'array',
            minItems: 1,
            maxItems: 2000,
            items: {
              type: 'object',
              minProperties: 1,
              maxProperties: 1,
              description:
                'One action: {wait:frames}, {tap:key|{key,code?}}, {press:{key,code?,frames}}, {keyDown:key}, {keyUp:key}, {click:point}, {move:point}, {drag:{from:point,to:point,frames}}, {capture:name}, {assert:condition}, {waitFor:{...condition,maxFrames}}, {repeat:{times,actions}}. Point: normalized {x,y} in 0..1, or {fromMetadata:{x:field,y:field}} in canvas pixels. Condition: {field,equals|notEquals|greaterThan|greaterThanOrEqual|lessThan|lessThanOrEqual|oneOf}. No JavaScript.',
            },
          },
        },
      },
    },
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
  scenario?: CaptureScenario;
};
const text = (value: unknown) => ({ type: 'text', text: JSON.stringify(value) });

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of request) {
    const chunk = Buffer.from(raw as Buffer);
    size += chunk.length;
    if (size > 65_536) throw new Error('Request exceeds 64 KiB.');
    chunks.push(chunk);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString());
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected JSON-RPC object.');
  return parsed as Record<string, unknown>;
}

export const MAX_CAPTURES_PER_TASK = 12;

export async function startLocalPreviewMcp(input: {
  previewUrl?: string;
  captureBudget?: { used: number };
  progress?: (text: string, blocked: boolean) => void;
  abort: AbortSignal;
  write: (line: string) => void;
  capture?: typeof captureBrowser;
  readCapturePlan?: () => unknown;
  onApproval?: ApproveTool;
  // Requests outside the sandbox are denied before anyone is asked.
  sandbox?: { permissions: AgentTask['permissions']; cwd: string };
}) {
  const controller = new AbortController();
  const signal = AbortSignal.any([input.abort, controller.signal]);
  const sandbox = resolvePermissions(input.sandbox?.permissions).sandbox;
  const approval = input.onApproval
    ? claudeLocalApproval(input.onApproval, sandbox ? { sandbox, cwd: input.sandbox!.cwd } : {}, input.write)
    : undefined;
  const source = input.previewUrl ? previewSource(input.previewUrl, signal) : undefined;
  const report = progressReporter(input.progress ?? ((text) => input.write(text)));
  const key = randomBytes(32).toString('hex');
  const renderKey = randomBytes(32).toString('hex');
  const jobs = new Map<string, Job>();
  let current: Promise<void> | undefined;
  let render: { id: string; html: string; gameUrl?: string; gameHtml?: string } | undefined;
  let origin = '';
  let lastStarted = 0;
  const captureBudget = input.captureBudget ?? { used: 0 };
  async function execute(job: Job, viewport: CaptureViewport): Promise<void> {
    try {
      input.write('Local capture: waiting for the current build…');
      const snapshot = await source!.snapshot();
      signal.throwIfAborted();
      job.revision = snapshot.revision;
      job.state = 'capturing';
      const gameUrl = job.scenario
        ? `${origin}/${renderKey}/${job.id}/game?capture=1&seed=${job.scenario.plan.seed}`
        : undefined;
      render = {
        id: job.id,
        html: capturePage(snapshot.html, gameUrl),
        gameUrl,
        gameHtml: job.scenario ? captureGameDocument(snapshot.html, job.scenario) : undefined,
      };
      input.write('Local capture: taking a screenshot…');
      job.image = await (input.capture ?? captureBrowser)({
        url: `${origin}/${renderKey}/${job.id}`,
        viewport,
        ...(gameUrl ? { gameUrl } : {}),
        signal: AbortSignal.any([signal, AbortSignal.timeout(job.scenario ? 90_000 : 45_000)]),
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
  async function call(name: unknown, raw: unknown, requestSignal: AbortSignal) {
    if (approval && name === approval.name) return approval.call(raw, requestSignal);
    const args = raw ?? {};
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid arguments.');
    const value = args as Record<string, unknown>;
    const keys = Object.keys(value);
    if (name === 'report_progress') return { content: [text(report(value))] };
    if (!source) throw new Error('No local preview is available.');
    if (name === 'preview_status' && keys.length === 0) return { content: [text(await source.status())] };
    if (
      (name === 'capture_game' || name === 'capture') &&
      keys.every((item) => ['viewport', 'mark', 'plan'].includes(item))
    ) {
      const viewport = value.viewport ?? 'desktop';
      if (viewport !== 'desktop' && viewport !== 'mobile') throw new Error('Unknown viewport.');
      const scenario = selectScenario(value, input.readCapturePlan);
      if (current) throw new Error('A capture is already running. Use capture_status.');
      if (captureBudget.used >= MAX_CAPTURES_PER_TASK)
        throw new Error(
          `This task used its ${MAX_CAPTURES_PER_TASK} captures. Continue without more visual checks and report what is unverified.`,
        );
      if (Date.now() - lastStarted < 2000) throw new Error('Wait two seconds before another capture.');
      captureBudget.used++;
      lastStarted = Date.now();
      while (jobs.size >= 3) jobs.delete(jobs.keys().next().value!);
      const job: Job = { id: randomUUID(), state: 'building', startedAt: new Date().toISOString(), scenario };
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
            scenario: job.scenario
              ? {
                  source: job.scenario.source,
                  mark: job.scenario.mark,
                  hash: job.scenario.hash,
                  seed: job.scenario.plan.seed,
                  fps: job.scenario.plan.fps,
                  ...job.image?.scenario,
                }
              : undefined,
            pollAfterMs: job.image || job.error ? undefined : 1000,
          }),
          ...(job.image ? [{ type: 'image', mimeType: 'image/png', data: job.image.png }] : []),
        ],
        isError: job.state === 'failed',
      };
    }
    throw new Error('Unknown local tool or unexpected arguments.');
  }
  const availableTools = [
    progressTool,
    ...(source ? TOOLS : []),
    ...(approval
      ? [{ name: approval.name, description: approval.description, inputSchema: approval.inputSchema }]
      : []),
  ];
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
      response.setHeader(
        'Content-Security-Policy',
        render.gameUrl ? CAPTURE_CSP.replace('frame-src about:', "frame-src 'self' about:") : CAPTURE_CSP,
      );
      response.end(render.html);
      return;
    }
    if (
      request.method === 'GET' &&
      render?.gameUrl &&
      request.url === new URL(render.gameUrl).pathname + new URL(render.gameUrl).search
    ) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Content-Security-Policy', CAPTURE_CSP);
      response.end(render.gameHtml);
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
      else if (message.method === 'tools/list')
        result = {
          tools: availableTools,
        };
      else if (message.method === 'tools/call') {
        const params = message.params as { name?: unknown; arguments?: unknown } | undefined;
        try {
          const disconnected = new AbortController();
          const disconnect = () => disconnected.abort();
          response.once('close', disconnect);
          try {
            result = await call(params?.name, params?.arguments, AbortSignal.any([signal, disconnected.signal]));
          } finally {
            response.off('close', disconnect);
          }
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
    tools: availableTools.map((item) => item.name),
    async close() {
      input.abort.removeEventListener('abort', stop);
      stop();
      await current;
      jobs.clear();
    },
  };
}
