import type { AppTool, ToolOutput } from 'genaicode/app-agent';
import type { ApiClient } from './api.js';
import { diffGame } from './checkout.js';
import { formatCheckoutDiff } from './checkout-display.js';
import { formatError } from './errors.js';
import { updateKit } from './kit-update.js';
import { deliverySession } from './submit-session.js';
import { formatSubmitLines, submitGame } from './submit.js';
import { postTurn } from './turn.js';
import type { CliTelemetry } from './telemetry.js';
import { runLadderAsync } from './verify.js';

type VerifyRun = NonNullable<Parameters<typeof runLadderAsync>[0]['run']>;

// The Play host's local capture MCP server (startLocalPreviewMcp).
export type CaptureServer = { url: string; authorization: string };

export type PlayToolsInput = {
  api: ApiClient;
  // The submission token of the open round.
  token: string;
  slug: string;
  root: string;
  run?: VerifyRun;
  env?: NodeJS.ProcessEnv;
  resetPreview?: () => Promise<void>;
  abort: () => AbortSignal;
  preview: () => Promise<string | undefined>;
  capture: () => Promise<CaptureServer | undefined>;
  write: (line: string) => void;
  fetch?: typeof fetch;
  pollMs?: number;
  // Runs delivery in the turn's writer lock; tool calls arrive outside.
  writer?: <T>(run: () => Promise<T>) => Promise<T>;
  telemetry?: CliTelemetry;
};

const CAPTURE_SCHEMA = {
  type: 'object',
  properties: {
    viewport: { type: 'string', enum: ['desktop', 'mobile'] },
    mark: { type: 'string', description: 'A capture step named in CAPTURE.json; capture stops there.' },
    plan: {
      type: 'object',
      description: 'An inline CAPTURE.json scenario: {seed?, fps?, maxFrames?, script: [actions]}. No JavaScript.',
    },
  },
  additionalProperties: false,
};

// Gamedev steps as app-agent tools: the agent checks, looks and delivers.
export function playAppTools(input: PlayToolsInput): AppTool[] {
  const delivery = (publish: boolean) => async (): Promise<string> => {
    const session = await deliverySession(input.api, input.slug);
    if (session?.locked)
      throw new Error(
        session.canTakeOver
          ? `Delivery is blocked by your own open agent session (job ${session.jobId}, generation ${session.generation}). Open this game's Studio thread to finish the session, or run /push --takeover (shell: gamedevpl push --takeover) to stop it and deliver your local files.`
          : `Delivery is blocked by an active platform agent (job ${session.jobId}, generation ${session.generation}); finish it in this game's Studio thread first.`,
      );
    // submitGame runs typecheck and check:static itself and refuses a red result.
    const submit = () =>
      submitGame({
        api: input.api,
        slug: input.slug,
        dest: input.root,
        run: input.run,
        publish,
        expectedSession: session ?? undefined,
        abort: input.abort(),
        onProgress: input.write,
      });
    const result = await (input.writer ? input.writer(submit) : submit());
    if (result.kind === 'delivered') input.telemetry?.record('delivered');
    return formatSubmitLines(result, input.slug).join('\n');
  };
  return [
    {
      name: 'game_round',
      description:
        'Record the creator request on gamedev.pl before you change the game. The platform either opens a build round (then edit the game) or answers the request itself (then pass its answer on and edit nothing).',
      inputSchema: {
        type: 'object',
        properties: { request: { type: 'string', description: "The creator's request, in their words." } },
        required: ['request'],
      },
      run: async ({ request }) => {
        const result = await postTurn(input.api, input.token, String(request ?? '').trim());
        return result.kind === 'reply'
          ? `The platform answered instead of opening a round:\n${result.text}`
          : `Round ${result.roundId} is open.${result.ack ? ` Platform note: ${result.ack}` : ''}`;
      },
    },
    {
      name: 'game_kit_update',
      description:
        'Update the pinned Creator Kit to the server release and run setup on the CLI host. Also repairs the local runtime. Preserves game sources; never changes dependencies by hand. Ask the creator to approve this action.',
      write: true,
      run: async () => {
        const lines: string[] = [];
        const update = () =>
          updateKit({
            api: input.api,
            cwd: input.root,
            env: input.env ?? process.env,
            abort: input.abort(),
            telemetry: input.telemetry,
            write: (line) => {
              lines.push(line);
              input.write(line);
            },
          });
        try {
          await (input.writer ? input.writer(update) : update());
        } finally {
          await input.resetPreview?.();
        }
        return lines.join('\n');
      },
    },
    {
      name: 'game_verify',
      description:
        'Run the game checks (typecheck, then check:static). Run it after your edits; fix what it reports and run it again.',
      run: async () => {
        const warnings: string[] = [];
        const result = await runLadderAsync({
          cwd: input.root,
          slug: input.slug,
          run: input.run,
          abort: input.abort(),
          onStage: (message) => {
            if (message.startsWith('Warning:')) warnings.push(message);
          },
        });
        return warnings
          .concat(
            result.ok
              ? 'Checks are green: typecheck, check:static.'
              : `Checks failed at ${result.stage}:\n${result.detail.trim()}`,
          )
          .join('\n');
      },
    },
    {
      name: 'game_preview',
      description: 'The URL of the live local preview of the game; starts it if it is not running.',
      run: async () => {
        const url = await input.preview();
        return url ? `Live preview: ${url}` : 'No live preview is available for this game.';
      },
    },
    {
      name: 'game_capture',
      description:
        'A screenshot of the current local build in the host browser, with its console errors. Look at it before you claim a visual change works. Capture after a meaningful visual change, not after every edit.',
      inputSchema: CAPTURE_SCHEMA,
      run: (args) => capture(input, args),
    },
    {
      name: 'game_diff',
      description: "What changed in the game's local files against the version on gamedev.pl.",
      run: async () =>
        formatCheckoutDiff(await diffGame({ api: input.api, slug: input.slug, dest: input.root })).join('\n'),
    },
    {
      name: 'game_submit',
      description:
        'Deliver the local game files as a preview to the gamedev.pl gate. Checks run first; a red result sends nothing.',
      write: true,
      run: delivery(false),
    },
    {
      name: 'game_publish',
      description:
        'Publish the local game files on gamedev.pl. Only when the creator asked to publish in this conversation; never on your own.',
      write: true,
      run: delivery(true),
    },
  ];
}

type CaptureJob = { jobId?: string; state?: string; error?: string; pollAfterMs?: number };

async function capture(input: PlayToolsInput, args: Record<string, unknown>): Promise<ToolOutput> {
  const server = await input.capture();
  if (!server) return 'Local capture is not available: no live preview is running.';
  const signal = input.abort();
  let id = 0;
  const call = async (name: string, value: Record<string, unknown>) => {
    const response = await (input.fetch ?? fetch)(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: server.authorization },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: value } }),
      signal,
    });
    const reply = (await response.json()) as {
      result?: {
        content?: Array<{ type: string; text?: string; mimeType?: string; data?: string }>;
        isError?: boolean;
      };
      error?: { message?: string };
    };
    if (!reply.result) throw new Error(reply.error?.message ?? 'Local capture failed.');
    return reply.result;
  };
  const read = (content: Array<{ type: string; text?: string }> = []): CaptureJob & Record<string, unknown> => {
    const first = content.find((item) => item.type === 'text')?.text ?? '{}';
    try {
      return JSON.parse(first) as CaptureJob & Record<string, unknown>;
    } catch {
      return { error: first };
    }
  };
  try {
    const started = await call('capture_game', args);
    const job = read(started.content);
    if (started.isError || !job.jobId) throw new Error(String(job.error ?? 'Local capture failed.'));
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, job.pollAfterMs ?? input.pollMs ?? 1000));
      signal.throwIfAborted();
      const polled = await call('capture_status', { jobId: job.jobId });
      const status = read(polled.content);
      if (polled.isError || status.state === 'failed') throw new Error(String(status.error ?? 'Local capture failed.'));
      if (status.state !== 'complete') continue;
      const images = (polled.content ?? [])
        .filter((item) => item.type === 'image' && item.data)
        .map((item) => ({ mimeType: item.mimeType ?? 'image/png', data: item.data! }));
      const { jobId: _job, pollAfterMs: _poll, ...details } = status;
      return { text: JSON.stringify(details), images };
    }
  } catch (error) {
    if (signal.aborted) throw error;
    return `Capture failed: ${formatError(error)}`;
  }
}
