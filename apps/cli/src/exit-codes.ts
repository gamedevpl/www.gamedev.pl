export const EXIT_GREEN = 0;
export const EXIT_RED = 1;
export const EXIT_REFUSED = 2;
export const EXIT_AUTH = 3;
export const EXIT_INPUT = 4;

export type CliExitCode =
  typeof EXIT_GREEN | typeof EXIT_RED | typeof EXIT_REFUSED | typeof EXIT_AUTH | typeof EXIT_INPUT;

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: CliExitCode,
    readonly next?: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}
