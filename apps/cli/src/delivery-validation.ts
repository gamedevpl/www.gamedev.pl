import { stripTerminalControls } from './ansi.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export class DeliveryValidationError extends CliError {
  readonly stage = 'delivery';
  readonly detail: string;

  constructor(
    error: CliError,
    readonly sourceHash: string,
  ) {
    const detail = stripTerminalControls(error.message).trim();
    super(detail, EXIT_REFUSED, 'Fix the reported errors, then retry /push. Staged files are kept.');
    this.detail = detail;
    this.apiCode = error.apiCode;
    this.httpStatus = error.httpStatus;
  }
}

export function deliveryValidationError(error: unknown, sourceHash: string): DeliveryValidationError | undefined {
  if (error instanceof CliError && error.httpStatus === 400 && error.apiCode === 'invalid_upload') {
    return new DeliveryValidationError(error, sourceHash);
  }
  return undefined;
}
