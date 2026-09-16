import type { handleReplLine } from './repl.js';
import { parseArgv } from './argv.js';
import { getStatus } from './turn.js';
import { playGame } from './play.js';
import { formatError } from './errors.js';

export async function runReplPlay(input: Parameters<typeof handleReplLine>[0], trimmed: string): Promise<void> {
  try {
    const parsed = parseArgv(['node', 'cli', ...(trimmed.startsWith('/') ? trimmed.slice(1).split(/\s+/u) : ['play'])]);
    const slug =
      parsed.args[0] ??
      input.workshop?.slug ??
      (input.token ? (await getStatus(input.api, input.token)).slug : undefined);
    input.onActivity?.('Starting game preview');
    await playGame({
      open: input.openPreview,
      onLocalPreview: input.onLocalPreview,
      cwd: input.workshop?.root ?? input.cwd ?? process.cwd(),
      slug,
      origin: input.api.origin,
      env: input.env,
      noOpen: parsed.flags['no-open'] === true,
      stop: parsed.flags.stop === true,
      write: input.write,
      telemetry: input.telemetry,
    });
  } catch (error) {
    input.write(formatError(error));
  }
}
