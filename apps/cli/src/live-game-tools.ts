import * as z from 'zod';
import { createPlayScriptClient, PLAY_SCRIPT_TOOL } from './play-script-client.js';
import { randomUUID } from 'node:crypto';
import { findLiveGame, type LiveGame } from './live-game.js';
import { LIVE_GAME_TOOLS, type LiveToolName } from './live-game-protocol.js';

export function liveGameTools(preview: () => string | undefined, scriptCwd?: string) {
  const task = randomUUID();
  const used = new Set<LiveGame>();
  let preparing = false;
  let directActions = 0;
  let advised = false;
  let scriptReady = false;
  let scriptActed = false;
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
      fromScript = false,
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
            cwd: scriptCwd,
            call: (name, args, signal) => tools.call(name, args, signal, true),
          });
          clients.add(client);
          scriptReady = true;
          scriptActed = false;
          directActions = 0;
          advised = false;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  modulePath: client.modulePath,
                  ...options,
                  usage:
                    'Write the strategy as ./play-heuristic.mjs in your current working directory, not /tmp or $TMPDIR. Claude Write needs an absolute path: use <cwd>/play-heuristic.mjs, resolving cwd with pwd. The .mjs file is not delivered as game source. If a temporary-directory write is denied, try the working directory before asking the creator or falling back to direct actions. Run node ./play-heuristic.mjs MODULE_PATH, passing this modulePath as the argument. Import it with pathToFileURL, await connect(), then use run(async ({initial, observe, act, call}) => { /* bounded heuristic */ }). act takes an action array and returns the usual observation. run takes control and releases it in finally. Consent is still required. Stop on errors or reclaim; never retry uncertain actions. Do not copy or print this temporary module: it holds task-scoped credentials. Return concise metrics, then refine the strategy code.',
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
      if (name === 'game_act' && fromScript) scriptActed = true;
      const guidance =
        name === 'game_act' && !fromScript && !scriptActed && !advised && ++directActions >= (scriptReady ? 1 : 2)
          ? ((advised = true),
            'For sustained play, call game_script_client now. Write ./play-heuristic.mjs in the working directory (not /tmp) and refine a bounded heuristic that calls observe/act locally; return compact progress and failure metrics. Use direct game_act only for a short probe or when a script is impractical.')
          : undefined;
      const data = result.data as { png?: unknown } | undefined;
      const encoded = typeof data?.png === 'string' ? data.png.replace(/^data:image\/png;base64,/, '') : '';
      const png = /^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(encoded) ? encoded : undefined;
      if (data) delete data.png;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ...result, untrusted: true }),
          },
          ...(guidance ? [{ type: 'text' as const, text: `Play guidance: ${guidance}` }] : []),
          ...(png ? [{ type: 'image' as const, mimeType: 'image/png', data: png }] : []),
        ],
      };
    },
    close() {
      for (const client of clients) client.close();
      clients.clear();
      for (const game of used) game.release(task);
      used.clear();
      directActions = 0;
      advised = false;
      scriptReady = false;
      scriptActed = false;
    },
  };
  return tools;
}
