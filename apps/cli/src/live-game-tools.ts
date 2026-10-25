import { randomUUID } from 'node:crypto';
import { findLiveGame, type LiveGame } from './live-game.js';
import { LIVE_GAME_TOOLS, type LiveToolName } from './live-game-protocol.js';

export function liveGameTools(preview: () => string | undefined) {
  const task = randomUUID();
  const used = new Set<LiveGame>();
  return {
    tools: LIVE_GAME_TOOLS,
    async call(name: LiveToolName, args: unknown, signal: AbortSignal) {
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
      for (const game of used) game.release(task);
      used.clear();
    },
  };
}
