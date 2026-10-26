import { createHash } from 'node:crypto';
import { closeSync, mkdtempSync, openSync, readSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

type Source = { sourceId: number; revision: string };
type Artifact = { offset: number; size: number; rawBytes: number; characters: number };
export type CodeQuery = { offset?: number; limit?: number; find?: string };
const maxDocumentBytes = 32 * 1024 * 1024;
const format = 'assembled-html-before-host-bridges';

export function createLiveCodeStore(maxBytes = 128 * 1024 * 1024, maxBindings = 256) {
  const artifacts = new Map<string, Artifact>();
  const sources = new Set<string>();
  let directory: string | undefined,
    fd: number | undefined,
    bytes = 0,
    stopped: string | undefined;
  const key = ({ sourceId, revision }: Source) => `${sourceId}:${revision}`;
  const status = () => ({
    bytes,
    maxBytes,
    artifacts: artifacts.size,
    bindings: sources.size,
    maxBindings,
    stopped: stopped ?? null,
    retention: 'until Play closes',
    format,
  });
  const describe = (source: Source) => {
    const artifact = sources.has(key(source)) ? artifacts.get(source.revision) : undefined;
    return artifact
      ? {
          available: true as const,
          revision: source.revision,
          format,
          bytes: artifact.rawBytes,
          characters: artifact.characters,
        }
      : {
          available: false as const,
          revision: source.revision,
          format,
          reason: stopped ?? 'This build was not retained for this preview source.',
        };
  };
  return {
    status,
    describe,
    retain(source: Source, html: string) {
      if (sources.has(key(source))) return describe(source);
      if (stopped) return describe(source);
      if (
        !Number.isSafeInteger(source.sourceId) ||
        !/^[a-f0-9]{64}$/.test(source.revision) ||
        Buffer.byteLength(html) > maxDocumentBytes ||
        createHash('sha256').update(html).digest('hex') !== source.revision
      )
        return describe(source);
      if (sources.size >= maxBindings) {
        stopped = 'Code archive capacity reached; retained builds remain available.';
        return describe(source);
      }
      if (!artifacts.has(source.revision)) {
        try {
          const compressed = gzipSync(html, { level: 1 });
          if (bytes + compressed.length > maxBytes) {
            stopped = 'Code archive capacity reached; retained builds remain available.';
            return describe(source);
          }
          if (fd === undefined) {
            directory = mkdtempSync(join(tmpdir(), 'gamedevpl-code-'));
            fd = openSync(join(directory, 'builds.gz'), 'wx+', 0o600);
          }
          let written = 0;
          while (written < compressed.length) {
            const count = writeSync(fd, compressed, written, compressed.length - written, bytes + written);
            if (!count) throw Error('Code archive write made no progress.');
            written += count;
          }
          artifacts.set(source.revision, {
            offset: bytes,
            size: compressed.length,
            rawBytes: Buffer.byteLength(html),
            characters: html.length,
          });
          bytes += compressed.length;
        } catch {
          stopped = 'Code archive storage failed; later builds are unavailable.';
          return describe(source);
        }
      }
      sources.add(key(source));
      return describe(source);
    },
    read(source: Source, query: CodeQuery) {
      const info = describe(source);
      if (!info.available) return info;
      const artifact = artifacts.get(source.revision)!;
      const compressed = Buffer.alloc(artifact.size);
      let position = 0;
      while (position < artifact.size) {
        const count = readSync(fd!, compressed, position, artifact.size - position, artifact.offset + position);
        if (!count) throw Error('Code archive file ended unexpectedly.');
        position += count;
      }
      const html = gunzipSync(compressed, { maxOutputLength: maxDocumentBytes }).toString('utf8');
      if (createHash('sha256').update(html).digest('hex') !== source.revision)
        throw Error('Code archive integrity failed.');
      const offset = query.find
        ? html.indexOf(query.find, query.offset ?? 0)
        : Math.min(query.offset ?? 0, html.length);
      const content = offset < 0 ? '' : html.slice(offset, offset + (query.limit ?? 8000));
      const end = offset + content.length;
      return {
        ...info,
        offset: offset < 0 ? null : offset,
        content,
        nextOffset: offset >= 0 && end < html.length ? end : null,
        offsetUnit: 'UTF-16 code units',
        ...(query.find ? { found: offset >= 0 } : {}),
      };
    },
    close() {
      if (fd !== undefined) closeSync(fd);
      if (directory) rmSync(directory, { recursive: true, force: true });
      fd = undefined;
      directory = undefined;
      artifacts.clear();
      sources.clear();
      stopped = 'Play closed; archived code is unavailable.';
    },
  };
}
