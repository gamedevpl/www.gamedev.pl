import { cliUsage } from './bin-name.js';
import { CliError, EXIT_AUTH, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';

export function describeError(error: unknown): { message: string; next?: string; code: number } {
  if (error instanceof CliError) {
    return { message: error.message, next: error.next, code: error.exitCode };
  }
  if (error instanceof TypeError) {
    return {
      message: 'offline or proxy failure — check the network and try again',
      next: cliUsage('whoami'),
      code: EXIT_REFUSED,
    };
  }
  return { message: error instanceof Error ? error.message : String(error), code: EXIT_REFUSED };
}

export function formatError(error: unknown): string {
  const shown = describeError(error);
  return shown.next ? `${shown.message}\nnext: ${shown.next}` : shown.message;
}

export function closedBetaWall(position?: number): CliError {
  const place = position !== undefined ? ` You are #${position} on the waitlist.` : '';
  return new CliError(`closed beta — this account is not admitted yet.${place}`, EXIT_REFUSED);
}

export function quotaExhausted(): CliError {
  return new CliError('daily quota exhausted — try again tomorrow, or wait for reset', EXIT_REFUSED);
}

export function moderationRefusal(): CliError {
  return new CliError('that text was refused by moderation — rephrase and send again', EXIT_REFUSED);
}

export function mustFixGate(stage?: string): CliError {
  const where = stage ? ` at ${stage}` : '';
  return new CliError(`gate red${where} — fix locally, then ${cliUsage('submit')}`, EXIT_REFUSED);
}

export function otherBuilder(builder: string): CliError {
  return new CliError(`this game is mid-round with ${builder} — wait or /builder to hand off`, EXIT_REFUSED);
}

export function grantRevoked(): CliError {
  return new CliError(`sign-in was revoked — run \`${cliUsage('login')}\``, EXIT_AUTH, cliUsage('login'));
}

export function credentialExpired(): CliError {
  return new CliError(`credential expired — run \`${cliUsage('login')}\``, EXIT_AUTH, cliUsage('login'));
}

export function pipeNeedsFlag(flag: string): CliError {
  return new CliError(`non-TTY: pass ${flag} to continue`, EXIT_INPUT, flag);
}
