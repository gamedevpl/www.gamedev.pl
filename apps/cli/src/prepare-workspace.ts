import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { childEnv, spawnCommand } from './delegate.js';
import { sanitizeEventPayload } from './ansi.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export async function prepareWorkspace(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  abort?: AbortSignal;
  write: (line: string) => void;
}): Promise<void> {
  const run = async (command: string, args: string[]): Promise<void> => {
    if (input.abort?.aborted) throw new CliError('setup cancelled', EXIT_REFUSED);
    const child = spawnCommand({ ...input, command, args, env: childEnv(input.env, ''), timeoutMs: 5 * 60_000 });
    for (const stream of [child.stdout, child.stderr]) {
      if (stream)
        createInterface({ input: stream }).on('line', (line: string) => input.write(sanitizeEventPayload(line)));
    }
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    if (input.abort?.aborted || code !== 0)
      throw new CliError('checkout setup did not complete', EXIT_REFUSED, `check the output in ${input.cwd}`);
  };
  if (existsSync(join(input.cwd, 'setup.mjs')) && existsSync(join(input.cwd, 'gamedev.lock'))) {
    input.write('preparing the pinned Creator Kit');
    await run(process.execPath, ['setup.mjs']);
  }
  if (existsSync(join(input.cwd, 'package.json')) && !existsSync(join(input.cwd, 'node_modules'))) {
    input.write('installing the checkout toolchain');
    await run('npm', ['ci']);
  }
}
