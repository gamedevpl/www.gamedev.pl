export type FetchProgress = { loaded: number; total: number | null };

export function responseByteTotal(headers: Headers): number | null {
  const encoding = headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') return null;
  const raw = headers.get('content-length');
  if (!raw) return null;
  const total = Number(raw);
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
}

export function formatLoadBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export async function readResponseBody(
  response: Response,
  onProgress?: (progress: FetchProgress) => void,
): Promise<string> {
  let total = responseByteTotal(response.headers);
  if (!response.body) {
    const text = await response.text();
    const loaded = new TextEncoder().encode(text).byteLength;
    onProgress?.({ loaded, total: total ?? loaded });
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    if (total != null && loaded > total) total = null;
    chunks.push(decoder.decode(value, { stream: true }));
    onProgress?.({ loaded, total });
  }
  chunks.push(decoder.decode());
  onProgress?.({ loaded, total });
  return chunks.join('');
}
