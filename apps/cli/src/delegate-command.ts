import type { ApiClient } from './api.js';
import type { CliTelemetry } from './telemetry.js';
import { cliUsage } from './bin-name.js';
import { CliError, EXIT_GREEN, EXIT_INPUT, EXIT_RED, EXIT_REFUSED } from './exit-codes.js';
import { detectLocalAdapters, handoffBuilder, pickAdapter, workshopTurn } from './workshop.js';
import { preflightAdapter } from './adapters.js';
import { getStatus } from './turn.js';
import { openCheckoutGame } from './local-recovery.js';
import { checkoutAgentTask } from './checkout-agent.js';
import { readLocalOperation } from './local-operation.js';

// Non-interactive twin of the REPL turn: agent, ladder, optional delivery.
export async function runDelegateVerb(input: {
  telemetry?: CliTelemetry;
  api: ApiClient;
  args: string[];
  flags: Record<string, string | boolean>;
  env: NodeJS.ProcessEnv;
  cwd: string;
  write: (line: string) => void;
}): Promise<number> {
  const request = input.args.join(' ').trim();
  if (!request) throw new CliError(cliUsage('delegate', '"<task>"'), EXIT_INPUT, '<task>');
  const adapters = detectLocalAdapters(input.env);
  const agent = typeof input.flags.agent === 'string' ? input.flags.agent : undefined;
  const spec = pickAdapter({ adapters, env: input.env }, agent);
  preflightAdapter(spec, input.env);
  const opened = await openCheckoutGame(input.api, input.cwd);
  if (!opened) throw new CliError('not inside a game checkout', EXIT_INPUT, cliUsage('checkout', '<slug>'));
  const localOnly = input.flags.local === true || Boolean(readLocalOperation(opened.root));
  let builder = localOnly ? 'platform' : ((await getStatus(input.api, opened.token)).builder ?? 'platform');
  if (!localOnly && builder !== 'self' && input.flags.handoff === true) {
    const outcome = await handoffBuilder(input.api, opened.token, 'self', builder);
    if (outcome.pending) {
      throw new CliError(
        'handoff pending — the platform agent has not acknowledged yet',
        EXIT_REFUSED,
        'retry shortly',
      );
    }
    builder = outcome.builder;
  }
  if (!localOnly && builder !== 'self') {
    throw new CliError(
      `builder is ${builder} — the platform owns this round`,
      EXIT_REFUSED,
      `${cliUsage('delegate', '--handoff')} takes it here`,
    );
  }
  const ws = {
    ...opened,
    env: input.env,
    adapters,
    telemetry: input.telemetry,
    builder,
    pick: async () => '',
    abort: { current: null },
    unattended: { deliver: input.flags.submit === true },
  };
  const run = localOnly ? checkoutAgentTask : workshopTurn;
  const ok = await run({
    api: input.api,
    ws,
    request,
    agent: typeof input.flags.agent === 'string' ? input.flags.agent : undefined,
    write: input.write,
  });
  return ok ? EXIT_GREEN : EXIT_RED;
}
