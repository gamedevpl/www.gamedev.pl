import { parseArgv } from './argv.js';
import type { ApiClient } from './api.js';
import { formatError } from './errors.js';
import { handoffBuilder, handoffLine, refreshBuilder, workshopTurn, type Workshop } from './workshop.js';

export async function handleWorkshopVerb(input: {
  cmd: string;
  rest: string[];
  api: ApiClient;
  ws: Workshop;
  write: (s: string) => void;
}): Promise<void> {
  const { ws } = input;
  try {
    if (input.cmd === 'builder') {
      let wanted: string | undefined = input.rest[0];
      if (!wanted) {
        await refreshBuilder(input.api, ws);
        const local = 'Build here with a local agent';
        const platform = 'Build on gamedev.pl';
        const chosen = await ws.pick(
          [...(ws.adapters.length ? [local] : []), platform, 'Cancel'],
          `Builder: ${ws.builder}. Who should build ${ws.slug}?`,
        );
        wanted = chosen === local ? 'self' : chosen === platform ? 'platform' : undefined;
        if (!wanted) return;
      }
      if (wanted !== 'self' && wanted !== 'platform') {
        input.write('Choose /builder self or /builder platform');
        return;
      }
      if (wanted === ws.builder) {
        input.write(`builder is already ${wanted}`);
        return;
      }
      const outcome = await handoffBuilder(input.api, ws.token, wanted, ws.builder);
      if (wanted === 'platform') delete ws.selectedAgent;
      ws.builder = outcome.builder;
      input.write(handoffLine(outcome, ws.slug));
      return;
    }
    const parsed = parseArgv(['node', 'cli', 'delegate', ...input.rest]);
    const request = parsed.args.join(' ');
    if (!request) {
      input.write(`say what to do: /delegate make the jump feel floatier`);
      return;
    }
    await refreshBuilder(input.api, ws);
    if (ws.builder !== 'self' && ws.adapters.length) {
      const local = 'Build here with a local agent';
      for (const spec of ws.adapters) ws.telemetry?.record('delegate_offered', { adapter: spec.name });
      const chosen = await ws.pick([local, 'Keep the platform builder'], `Who should handle this task for ${ws.slug}?`);
      if (chosen !== local) return;
      const outcome = await handoffBuilder(input.api, ws.token, 'self', ws.builder);
      ws.builder = outcome.builder;
      input.write(handoffLine(outcome, ws.slug));
      if (outcome.pending) {
        input.write('Handoff pending. Run /delegate again after the builder changes.');
        return;
      }
    }
    await workshopTurn({
      api: input.api,
      ws,
      request,
      agent: typeof parsed.flags.agent === 'string' ? parsed.flags.agent : undefined,
      write: input.write,
    });
  } catch (error) {
    input.write(formatError(error));
  }
}
