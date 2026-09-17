import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const artifactSchema = z
  .object({
    name: z.string().min(1).max(120),
    mime: z.enum([
      'image/png',
      'image/jpeg',
      'image/webp',
      'video/webm',
      'video/mp4',
      'application/json',
      'text/plain',
    ]),
    purpose: z.enum(['reference', 'asset', 'diagnostic']),
    data: z.string().max(24_000_000),
    revision: z.string().max(100),
    device: z.string().max(80),
    capturedAt: z.string().datetime(),
  })
  .strict();
export type Artifact = Omit<z.infer<typeof artifactSchema>, 'data'> & {
  id: string;
  hash: string;
  bytes: number;
  path: string;
};
export function workbenchArtifacts() {
  const root = mkdtempSync(join(tmpdir(), 'gamedev-evidence-'));
  const records = new Map<string, Artifact>();
  let total = 0;
  return {
    add(input: unknown) {
      const value = artifactSchema.parse(input);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw Error('Invalid base64');
      const bytes = Buffer.from(value.data, 'base64');
      if (!bytes.length || bytes.length > 16_000_000 || total + bytes.length > 128_000_000 || records.size >= 100)
        throw Error('Attachment storage limit reached');
      const signatures: Record<string, boolean> = {
        'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
        'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
        'video/webm': bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
        'video/mp4': bytes.toString('ascii', 4, 8) === 'ftyp',
      };
      if (signatures[value.mime] === false) throw Error('Attachment type does not match its contents');
      if (value.mime === 'application/json') JSON.parse(bytes.toString('utf8'));
      const ext = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'video/webm': 'webm',
        'video/mp4': 'mp4',
        'application/json': 'json',
        'text/plain': 'txt',
      }[value.mime];
      const id = randomUUID(),
        path = join(root, `${id}.${ext}`);
      writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
      total += bytes.length;
      const { data: _data, ...meta } = value;
      const record = { ...meta, id, hash: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, path };
      records.set(id, record);
      const { path: _path, ...publicRecord } = record;
      return publicRecord;
    },
    resolve(ids: string[]) {
      if (ids.length > 8 || new Set(ids).size !== ids.length) throw Error('Too many attachments');
      return ids.map((id) => {
        const record = records.get(id);
        if (!record) throw Error('Attachment expired');
        return record;
      });
    },
    close() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
