import type { ApiClient } from './api.js';
import { parseArgv, jsonMode } from './argv.js';
import { cliUsage } from './bin-name.js';
import { diffGame, findCheckout } from './checkout.js';
import { formatCheckoutStatus } from './checkout-display.js';
import { formatError } from './errors.js';
import { formatStatusLines } from './status-watch.js';
import { getStatus } from './turn.js';

export async function replStatus(
  input: {
    api: ApiClient;
    token: string | null;
    cwd?: string;
    workshop?: { root: string; slug: string; token: string };
    write: (text: string) => void;
  },
  rest: string[],
): Promise<void> {
  const parsed = parseArgv(['node', 'cli', 'status', ...rest]);
  const asJson = jsonMode(parsed.flags);
  const here = parsed.args[0] ? null : (input.workshop ?? findCheckout(input.cwd ?? process.cwd()));
  if (here) {
    try {
      const report = await diffGame({ api: input.api, slug: here.slug, dest: here.root });
      input.write(asJson ? JSON.stringify(report) : formatCheckoutStatus(report, here.slug).join('\n'));
    } catch (error) {
      input.write(formatError(error));
    }
    if (asJson) return;
  }
  const token = parsed.args[0] ?? input.workshop?.token ?? input.token;
  if (!token) {
    if (!here) input.write(`run it as ${cliUsage('status', '<token>')}`);
    return;
  }
  try {
    const status = await getStatus(input.api, token);
    const lines = formatStatusLines(status, input.api.origin);
    if (here) lines[0] = `Round status: ${lines[0]}`;
    input.write(asJson ? JSON.stringify(status) : `${here ? '\n' : ''}${lines.join('\n')}`);
  } catch (error) {
    input.write(here ? `Round status unavailable: ${formatError(error)}` : formatError(error));
  }
}
