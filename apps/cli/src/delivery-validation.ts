import { stripTerminalControls } from './ansi.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import type { ApiClient } from './api.js';
import type { TreeFile } from './checkout-sync.js';
import { verificationFilesHash } from './verification-source.js';

export type RejectedUpload = { files: TreeFile[]; paths: string[] };

export class DeliveryValidationError extends CliError {
  readonly stage = 'delivery';
  readonly detail: string;
  readonly sourceHash: string;

  constructor(
    error: CliError,
    readonly upload: RejectedUpload,
  ) {
    const detail = stripTerminalControls(error.message).trim();
    super(detail, EXIT_REFUSED, 'Fix the reported errors, then retry /push. Staged files are kept.');
    this.detail = detail;
    this.sourceHash = verificationFilesHash(upload.files);
    this.apiCode = error.apiCode;
    this.httpStatus = error.httpStatus;
  }
}

export function deliveryValidationError(error: unknown, upload: RejectedUpload): DeliveryValidationError | undefined {
  if (error instanceof CliError && error.httpStatus === 400 && error.apiCode === 'invalid_upload') {
    return new DeliveryValidationError(error, upload);
  }
  return undefined;
}

export async function rejectedStagedPaths(api: ApiClient, slug: string, upload?: RejectedUpload): Promise<string[]> {
  if (!upload?.paths.length) return [];
  const body = await api.request<{ files?: Array<TreeFile & { stagedBy?: string }>; deleted?: string[] }>(
    'GET',
    `/api/me/studio/games/${slug}/sources`,
  );
  const expected = new Map(upload.files.map((file) => [file.path, file.content]));
  const staged = new Map((body.files ?? []).filter((file) => file.stagedBy).map((file) => [file.path, file]));
  return upload.paths.filter((path) => {
    const file = staged.get(path);
    const deleted = body.deleted?.includes(path);
    if (!file && !deleted) return false;
    if (file ? file.stagedBy !== 'owner' || file.content !== expected.get(path) : expected.has(path)) {
      throw new CliError(
        `Studio staging changed since the rejected upload (${path}). Review it before retrying delivery.`,
        EXIT_REFUSED,
      );
    }
    return true;
  });
}
