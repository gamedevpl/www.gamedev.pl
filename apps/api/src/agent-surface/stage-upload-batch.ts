// Managed sessions: one upload contract per stage_upload_url batch.
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import { uploadRequest, UPLOAD_REQUEST_PROPS } from './upload-request.js';

// Paths hold no newline, so one token binds the list.
export const BATCH_PATH_SEPARATOR = '\n';

export const MANAGED_STAGE_UPLOAD_DESCRIPTION =
  'Mints one upload contract for every path in `paths` (up to 50 per call), as data: `batch.url`, ' +
  '`batch.method`, `batch.headers` and `batch.paths`. PUT each file to `batch.url` with `?path=<its path>` ' +
  'appended and exactly `batch.headers`; the same headers serve every listed path until expiresAt. ' +
  'The URL alone is not a credential, the Authorization header is. Each PUT applies the same validation as ' +
  'stage_source_file. `path` alone returns a single-file contract as `url`, `method` and `headers`.';

export const MANAGED_STAGE_UPLOAD_OUTPUT = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    path: { type: 'string' },
    ...UPLOAD_REQUEST_PROPS,
    maxBytes: { type: 'number' },
    batch: {
      type: 'object',
      description: 'One contract for every listed path: PUT to url?path=<path> with headers.',
      properties: {
        url: { type: 'string' },
        ...UPLOAD_REQUEST_PROPS,
        paths: { type: 'array', items: { type: 'string' } },
        maxBytes: { type: 'number' },
      },
      required: ['url', 'method', 'headers', 'paths', 'maxBytes'],
    },
    expiresAt: { type: 'string' },
    expiresInSeconds: { type: 'number' },
    rejected: {
      type: 'array',
      description: 'Paths in this batch that were refused, with why. The rest are in batch.paths.',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, reason: { type: 'string' } },
        required: ['path', 'reason'],
      },
    },
  },
} as const;

export function batchUploadContract(token: string, paths: string[]) {
  return {
    url: `${canonicalAppBaseUrl()}${AGENT_CHANNEL_ROUTES.SOURCES_STAGE_UPLOAD}`,
    ...uploadRequest(token, 'text/plain; charset=utf-8'),
    paths,
    maxBytes: 1_000_000,
  };
}

// The PUT's path: the token's own, or a listed ?path=.
export function stagePutPath(bound: string, queried: string): string | null {
  const allowed = bound.split(BATCH_PATH_SEPARATOR).filter(Boolean);
  if (!queried) return allowed.length === 1 ? allowed[0]! : null;
  return allowed.includes(queried) ? queried : null;
}
