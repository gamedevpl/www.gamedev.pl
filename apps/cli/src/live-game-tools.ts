import * as z from 'zod';
import { createPlayScriptClient, PLAY_SCRIPT_TOOL } from './play-script-client.js';
import { randomUUID } from 'node:crypto';
import { findLiveGame, type LiveGame } from './live-game.js';
import { LIVE_GAME_TOOLS, type LiveToolName } from './live-game-protocol.js';

export function liveGameTools(preview: () => string | undefined) {
  const task = randomUUID();
  const used = new Set<LiveGame>();
  let preparing = false;
  const clients = new Set<{ close(): void }>();
  const release = () => {
    for (const game of used) game.release(task, { taskEnded: false });
  };
  const tools = {
    tools: [...LIVE_GAME_TOOLS, PLAY_SCRIPT_TOOL],
    async call(
      name: LiveToolName | 'game_script_client',
      args: unknown,
      signal: AbortSignal,
    ): Promise<{ content: Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string }> }> {
      if (name === 'game_script_client') {
        const options = z
          .object({
            maxCalls: z.number().int().min(1).max(1000).default(200),
            timeoutMs: z.number().int().min(1000).max(300000).default(60000),
          })
          .strict()
          .parse(args);
        if (preparing) throw Error('Play script client setup is already running.');
        preparing = true;
        try {
          for (const client of clients) client.close();
          clients.clear();
          const client = await createPlayScriptClient({
            ...options,
            signal,
            release,
            call: (name, args, signal) => tools.call(name, args, signal),
          });
          clients.add(client);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  modulePath: client.modulePath,
                  ...options,
                  usage:
                    'Pass modulePath as an argument to your Node ESM strategy. Import it with pathToFileURL, await connect(), then use run(async ({initial, observe, act, call}) => { /* bounded heuristic */ }). act takes an action array and returns the usual observation. run takes control and releases it in finally. Consent is still required. Stop on errors or reclaim; never retry uncertain actions. Do not copy or print this temporary module: it holds task-scoped credentials. Return concise metrics, then refine the strategy code.',
                }),
              },
            ],
          };
        } finally {
          preparing = false;
        }
      }
      const game = findLiveGame(preview());
      if (!game) throw Error('Open the local Play workbench for this checkout to inspect its running game.');
      used.add(game);
      const result = await game.call(task, name, args, signal);
      const data = result.data as { png?: unknown } | undefined;
      const encoded = typeof data?.png === 'string' ? data.png.replace(/^data:image\/png;base64,/, '') : '';
      const png = /^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(encoded) ? encoded : undefined;
      if (data) delete data.png;
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ...result, untrusted: true }) },
          ...(png ? [{ type: 'image' as const, mimeType: 'image/png', data: png }] : []),
        ],
      };
    },
    close() {
      for (const client of clients) client.close();
      clients.clear();
      for (const game of used) game.release(task);
      used.clear();
    },
  };
  return tools;
}
