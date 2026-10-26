import type { AppTool } from 'genaicode/app-agent';
import { liveGameTools } from './live-game-tools.js';

export function liveGameAppTools(preview: () => Promise<string | undefined>, abort: () => AbortSignal, cwd: string) {
  let url: string | undefined;
  const live = liveGameTools(() => url, cwd);
  const tools: AppTool[] = live.tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
    async run(args) {
      url = await preview();
      const signal = abort();
      const close = () => live.close();
      signal.addEventListener('abort', close, { once: true });
      try {
        const result = await live.call(name, args, signal);
        return {
          text: result.content
            .filter((item) => item.type === 'text')
            .map((item) => item.text)
            .join('\n'),
          images: result.content
            .filter((item) => item.type === 'image')
            .map(({ mimeType, data }) => ({ mimeType, data })),
        };
      } finally {
        signal.removeEventListener('abort', close);
      }
    },
  }));
  return { tools, close: () => live.close() };
}
