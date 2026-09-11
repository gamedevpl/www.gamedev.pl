// The refusal every delivery path throws, and every caller catches.

import type { PreflightKind } from '@gamedevpl/contract';

// Preflight kinds counted by delivery metrics.
export type PreflightRefusalKind = PreflightKind;

export class InvalidUploadError extends Error {
  readonly kind?: PreflightRefusalKind;
  // Required paths the upload lacked, so a caller can offer them.
  readonly missingPaths?: readonly string[];

  constructor(message: string, kind?: PreflightRefusalKind, missingPaths?: readonly string[]) {
    super(message);
    this.name = 'InvalidUploadError';
    this.kind = kind;
    this.missingPaths = missingPaths;
  }
}
