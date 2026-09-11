/**
 * Just enough tar to read a GitHub source archive, and to write a small one.
 *
 * `GET /repos/<repo>/tarball/<ref>` answers the whole games repo in one request,
 * which is the difference between a bake that costs ~1,000 GitHub reads and one
 * that costs 1 (see `games-repo-archive.ts`). Reading it needs a tar parser, and
 * this is that parser rather than a dependency: the format is a fixed 512-byte
 * header we only read four fields of, and `git archive` emits a narrow, well-known
 * subset of it.
 *
 * Handled, because GitHub's archives contain all of them:
 *   - ustar `prefix` — paths over 100 chars split across two header fields
 *   - pax extended headers (`x`) — a `path=` record overriding the next entry
 *   - GNU long names (`L`) — the older long-path convention
 *
 * Not handled, because a source archive never contains them: sparse files, device
 * nodes, hard links. They are skipped rather than guessed at.
 *
 * The writer ({@link writeTarGz}) is here for the same reason the reader is: the
 * one archive we emit — a creator's workspace, a few dozen small text files — needs
 * plain ustar and nothing else, and a dependency that can express symlinks, sparse
 * files and long-name extensions is a larger surface than the format we actually
 * want to produce.
 */

import { gzipSync } from 'node:zlib';

const BLOCK_SIZE = 512;

/** Header field offsets, per the ustar layout. */
const NAME_OFFSET = 0;
const NAME_LENGTH = 100;
const SIZE_OFFSET = 124;
const SIZE_LENGTH = 12;
const TYPE_OFFSET = 156;
const MAGIC_OFFSET = 257;
const PREFIX_OFFSET = 345;
const PREFIX_LENGTH = 155;

/** Type flags we act on; everything else (dirs, links, devices) is skipped. */
const TYPE_FILE = '0';
const TYPE_FILE_ALT = '\0';
const TYPE_GNU_LONGNAME = 'L';
const TYPE_PAX_NEXT = 'x';
const TYPE_PAX_GLOBAL = 'g';

export interface TarEntry {
  path: string;
  bytes: Uint8Array;
}

export interface ReadTarOptions {
  /**
   * Decides which entries are worth keeping in memory. Everything else is
   * skipped without ever being retained — the whole point when the archive is
   * larger than the part of it anyone wants.
   */
  include?: (path: string) => boolean;
  /** Ceiling on retained bytes. Exceeding it throws rather than exhausting the heap. */
  maxTotalBytes?: number;
}

const DEFAULT_MAX_TOTAL_BYTES = 512 * 1024 * 1024;

function readString(block: Uint8Array, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return Buffer.from(end === -1 ? slice : slice.subarray(0, end)).toString('utf8');
}

/** Sizes are octal ASCII. GNU's base-256 form appears only for entries >8GB. */
function readSize(block: Uint8Array): number {
  const raw = readString(block, SIZE_OFFSET, SIZE_LENGTH).trim();
  if (raw === '') {
    return 0;
  }
  const size = Number.parseInt(raw, 8);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error(`tar: unreadable entry size "${raw}"`);
  }
  return size;
}

/** A pax header is a stream of `<len> <key>=<value>\n` records; we want `path`. */
function readPaxPath(payload: Uint8Array): string | null {
  const text = Buffer.from(payload).toString('utf8');
  let cursor = 0;
  while (cursor < text.length) {
    const space = text.indexOf(' ', cursor);
    if (space === -1) {
      break;
    }
    const length = Number.parseInt(text.slice(cursor, space), 10);
    if (!Number.isFinite(length) || length <= 0) {
      break;
    }
    const record = text.slice(space + 1, cursor + length).replace(/\n$/, '');
    const equals = record.indexOf('=');
    if (equals !== -1 && record.slice(0, equals) === 'path') {
      return record.slice(equals + 1);
    }
    cursor += length;
  }
  return null;
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

/**
 * Yields the regular files in a (already decompressed) tar stream.
 *
 * Buffers only the entry being read plus whatever `include` keeps, so a 100MB
 * archive does not become 100MB of retained chunks.
 */
export async function* readTarEntries(
  source: AsyncIterable<Uint8Array>,
  options: ReadTarOptions = {},
): AsyncGenerator<TarEntry> {
  const include = options.include ?? (() => true);
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  // A queue of arrived chunks rather than one growing Buffer: concatenating on
  // every chunk would copy the whole archive again per chunk.
  const queue: Buffer[] = [];
  let queued = 0;

  /** Removes and returns the first `n` bytes; callers check `queued` first. */
  function consume(n: number): Buffer {
    const parts: Buffer[] = [];
    let taken = 0;
    while (taken < n) {
      const head = queue[0];
      const want = n - taken;
      if (head.length <= want) {
        parts.push(queue.shift() as Buffer);
        taken += head.length;
      } else {
        parts.push(head.subarray(0, want));
        queue[0] = head.subarray(want);
        taken = n;
      }
    }
    queued -= n;
    return parts.length === 1 ? parts[0] : Buffer.concat(parts, n);
  }

  let retained = 0;
  /** Set by a pax `x` or GNU `L` header — overrides the next entry's own name. */
  let overrideName: string | null = null;
  let sawEmptyBlock = false;
  /** The header of an entry whose body has not fully arrived yet. */
  let heldHeader: Buffer | null = null;

  for await (const chunk of source) {
    const buffer = Buffer.from(chunk);
    if (buffer.length === 0) {
      continue;
    }
    queue.push(buffer);
    queued += buffer.length;

    for (;;) {
      if (!heldHeader) {
        if (queued < BLOCK_SIZE) {
          break;
        }
        heldHeader = consume(BLOCK_SIZE);
      }
      const header = heldHeader;

      if (isZeroBlock(header)) {
        // Two consecutive zero blocks end the archive; one alone is padding.
        heldHeader = null;
        if (sawEmptyBlock) {
          return;
        }
        sawEmptyBlock = true;
        continue;
      }
      sawEmptyBlock = false;

      const size = readSize(header);
      const padded = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
      if (queued < padded) {
        break; // Entry body has not fully arrived yet; the header stays held.
      }
      heldHeader = null;

      const block = consume(padded);
      const body = block.subarray(0, size);

      const type = String.fromCharCode(header[TYPE_OFFSET]);

      if (type === TYPE_GNU_LONGNAME) {
        overrideName = Buffer.from(body).toString('utf8').replace(/\0+$/, '');
        continue;
      }
      if (type === TYPE_PAX_NEXT) {
        overrideName = readPaxPath(body) ?? overrideName;
        continue;
      }
      if (type === TYPE_PAX_GLOBAL) {
        continue; // Global defaults carry nothing we read.
      }

      const name = readString(header, NAME_OFFSET, NAME_LENGTH);
      const isUstar = readString(header, MAGIC_OFFSET, 5) === 'ustar';
      const prefix = isUstar ? readString(header, PREFIX_OFFSET, PREFIX_LENGTH) : '';
      const path = overrideName ?? (prefix ? `${prefix}/${name}` : name);
      overrideName = null;

      if (type !== TYPE_FILE && type !== TYPE_FILE_ALT) {
        continue; // Directories, symlinks, everything else.
      }
      if (!include(path)) {
        continue;
      }

      retained += size;
      if (retained > maxTotalBytes) {
        throw new Error(`tar: archive exceeds ${maxTotalBytes} retained bytes`);
      }
      // Copy rather than view: `body` sits inside a padded block that is itself a
      // slice of an arriving chunk, so a view would pin that whole chunk for as
      // long as the caller holds one small file — and `retained` would be
      // counting something other than what is actually held.
      yield { path, bytes: Uint8Array.from(body) };
    }
  }
}

/** One file to write. Directory entries are implied by paths and never emitted. */
export interface TarInput {
  path: string;
  /** Text is encoded UTF-8; bytes are written as given. */
  content: string | Uint8Array;
  /** Defaults to 0o644, or 0o755 when {@link TarInput.executable} is set. */
  executable?: boolean;
}

/** Octal, NUL-terminated, left-padded — the ustar convention for numeric fields. */
function writeOctal(header: Buffer, value: number, offset: number, length: number): void {
  const text = value.toString(8).padStart(length - 1, '0');
  header.write(`${text}\0`, offset, length, 'ascii');
}

/**
 * Split a path across ustar's `name` (100) and `prefix` (155) fields.
 *
 * Long-name extensions (pax `x`, GNU `L`) are deliberately not emitted: they are a
 * second encoding of the same fact, and every consumer of what we write is either
 * `tar -xz` or this file's own reader. A path that will not fit is a bug in the
 * caller, so it throws rather than silently truncating a file into the wrong place.
 */
function splitUstarPath(path: string): { name: string; prefix: string } {
  if (Buffer.byteLength(path, 'utf8') <= NAME_LENGTH) {
    return { name: path, prefix: '' };
  }
  const cut = path.lastIndexOf('/', PREFIX_LENGTH);
  const prefix = cut === -1 ? '' : path.slice(0, cut);
  const name = cut === -1 ? path : path.slice(cut + 1);
  if (
    prefix === '' ||
    Buffer.byteLength(name, 'utf8') > NAME_LENGTH ||
    Buffer.byteLength(prefix, 'utf8') > PREFIX_LENGTH
  ) {
    throw new Error(`tar: path too long for ustar (${path})`);
  }
  return { name, prefix };
}

function buildHeader(path: string, size: number, mode: number, mtime: number): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE);
  const { name, prefix } = splitUstarPath(path);

  header.write(name, NAME_OFFSET, NAME_LENGTH, 'utf8');
  writeOctal(header, mode, 100, 8);
  writeOctal(header, 0, 108, 8); // uid
  writeOctal(header, 0, 116, 8); // gid
  writeOctal(header, size, SIZE_OFFSET, SIZE_LENGTH);
  writeOctal(header, mtime, 136, 12);
  header.write(TYPE_FILE, TYPE_OFFSET, 1, 'ascii');
  header.write('ustar\0', MAGIC_OFFSET, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write(prefix, PREFIX_OFFSET, PREFIX_LENGTH, 'utf8');

  // The checksum is computed with its own field read as spaces, then written back
  // over it — the one field that cannot be filled in a single pass.
  header.write(' '.repeat(8), 148, 8, 'ascii');
  let sum = 0;
  for (const byte of header) {
    sum += byte;
  }
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');

  return header;
}

/**
 * A gzipped ustar archive of small files, held in memory.
 *
 * In memory because the caller is an HTTP response of a few dozen text files, and a
 * stream would buy nothing but a Content-Length we would then have to give up. Byte
 * output is a pure function of the inputs: `mtime` defaults to 0 rather than "now",
 * so the same workspace requested twice is the same archive and can be compared,
 * cached, or ETagged without a timestamp making every response unique.
 */
export function writeTarGz(files: TarInput[], options: { mtime?: number } = {}): Buffer {
  const mtime = options.mtime ?? 0;
  const seen = new Set<string>();
  const blocks: Buffer[] = [];

  for (const file of files) {
    const path = file.path.replace(/^\.\//, '');
    if (path === '' || path.startsWith('/') || path.split('/').includes('..')) {
      throw new Error(`tar: refusing to write path "${file.path}"`);
    }
    // A duplicate would extract as last-one-wins, so the archive would disagree with
    // the list the caller thinks it handed over.
    if (seen.has(path)) {
      throw new Error(`tar: duplicate path "${path}"`);
    }
    seen.add(path);

    const body = typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : Buffer.from(file.content);
    blocks.push(buildHeader(path, body.length, file.executable ? 0o755 : 0o644, mtime), body);
    const padding = (BLOCK_SIZE - (body.length % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding > 0) {
      blocks.push(Buffer.alloc(padding));
    }
  }

  // Two zero blocks terminate the archive; anything less and `tar` warns.
  blocks.push(Buffer.alloc(BLOCK_SIZE * 2));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}
