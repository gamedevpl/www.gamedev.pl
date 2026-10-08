// Signed uploads described as data, so any HTTP client can perform them.

export interface UploadRequest {
  method: 'PUT';
  headers: Record<string, string>;
}

// The upload contract as data, for any HTTP client.
export function uploadRequest(token: string, contentType: string): UploadRequest {
  return { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType } };
}

// Output-schema fields for a tool that hands one out.
export const UPLOAD_REQUEST_PROPS = {
  method: { type: 'string', enum: ['PUT'], description: 'HTTP method for the upload.' },
  headers: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Send exactly these headers with the upload. Authorization carries the short-lived upload credential — the URL alone is not one.',
  },
} as const;

// Upload contract from a channel reply; null when incomplete.
export function uploadRequestFromChannel(reply: object): UploadRequest | null {
  const body = reply as { method?: unknown; headers?: unknown };
  if (body.method !== 'PUT' || !body.headers || typeof body.headers !== 'object') return null;
  const headers = Object.fromEntries(
    Object.entries(body.headers as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  return headers.Authorization ? { method: 'PUT', headers } : null;
}
