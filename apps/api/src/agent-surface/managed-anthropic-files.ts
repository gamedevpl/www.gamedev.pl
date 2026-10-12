// Sessions copy mounted files at creation; originals are then deleted.

import { z } from 'zod';
import type { ManagedWorkspaceArchive } from './managed-workspace.js';
import { ManagedWorkspaceError } from './managed-workspace.js';

// Mount paths are rooted here inside the sandbox.
export const ANTHROPIC_UPLOADS_DIR = '/mnt/session/uploads';

const FileSchema = z.object({ id: z.string().min(1) });

export interface AnthropicFilesClient {
  baseUrl: string;
  apiKey: string;
  apiVersion: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}

export interface MountedFile {
  id: string;
  name: string;
}

async function upload(client: AnthropicFilesClient, archive: ManagedWorkspaceArchive): Promise<MountedFile> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(archive.bytes)], { type: 'application/gzip' }), archive.name);
  const response = await client.fetchImpl(`${client.baseUrl}/v1/files`, {
    method: 'POST',
    headers: { 'x-api-key': client.apiKey, 'anthropic-version': client.apiVersion },
    body: form,
    signal: AbortSignal.timeout(client.timeoutMs),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ManagedWorkspaceError(`anthropic file upload failed: ${response.status} ${body}`.trim(), response.status);
  }
  const parsed = FileSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ManagedWorkspaceError('anthropic file upload returned no file id');
  return { id: parsed.data.id, name: archive.name };
}

export async function deleteAnthropicFiles(client: AnthropicFilesClient, files: readonly MountedFile[]): Promise<void> {
  await Promise.all(
    files.map((file) =>
      client
        .fetchImpl(`${client.baseUrl}/v1/files/${encodeURIComponent(file.id)}`, {
          method: 'DELETE',
          headers: { 'x-api-key': client.apiKey, 'anthropic-version': client.apiVersion },
          signal: AbortSignal.timeout(client.timeoutMs),
        })
        .catch(() => undefined),
    ),
  );
}

// All or nothing: a partial upload is deleted before the error surfaces.
export async function uploadAnthropicFiles(
  client: AnthropicFilesClient,
  archives: readonly ManagedWorkspaceArchive[],
): Promise<MountedFile[]> {
  const results = await Promise.allSettled(archives.map((archive) => upload(client, archive)));
  const uploaded = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (!failed) return uploaded;
  await deleteAnthropicFiles(client, uploaded);
  throw failed.reason instanceof ManagedWorkspaceError
    ? failed.reason
    : new ManagedWorkspaceError(`anthropic file upload failed: ${String(failed.reason)}`);
}

export function mountedFileResources(files: readonly MountedFile[]): object[] {
  return files.map((file) => ({ type: 'file', file_id: file.id, mount_path: `/${file.name}` }));
}
