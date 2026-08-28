export type UnpackedArchiveEntry = { path: string; bytes: Uint8Array };

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function blobFromBytes(data: Uint8Array): Blob {
  return new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer]);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser cannot inflate zip entries');
  }
  const stream = blobFromBytes(data).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser cannot inflate gzip archives');
  }
  const stream = blobFromBytes(data).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function sniffZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

function sniffGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function looksLikeTarGzName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
}

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

async function unpackZip(bytes: Uint8Array): Promise<UnpackedArchiveEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEocd = Math.max(0, bytes.length - 22 - 65535);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minEocd; i--) {
    if (u32(view, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const cdSize = u32(view, eocd + 12);
  const cdOffset = u32(view, eocd + 16);
  const entries: UnpackedArchiveEntry[] = [];
  let pos = cdOffset;
  const cdEnd = Math.min(bytes.length, cdOffset + cdSize);
  while (pos + 46 <= cdEnd) {
    if (u32(view, pos) !== CD_SIG) break;
    const method = u16(view, pos + 10);
    const compSize = u32(view, pos + 20);
    const nameLen = u16(view, pos + 28);
    const extraLen = u16(view, pos + 30);
    const commentLen = u16(view, pos + 32);
    const localOff = u32(view, pos + 42);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen)).replaceAll('\\', '/');
    pos += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith('/')) continue;
    if (localOff + 30 > bytes.length) continue;
    const localNameLen = u16(view, localOff + 26);
    const localExtraLen = u16(view, localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    let raw: Uint8Array;
    if (method === 0) raw = compressed.slice();
    else if (method === 8) raw = await inflateRaw(compressed);
    else continue;
    entries.push({ path: name.replace(/^\/+/, ''), bytes: raw });
  }
  return entries;
}

function readTarCString(bytes: Uint8Array, start: number, length: number): string {
  const slice = bytes.subarray(start, start + length);
  const zero = slice.indexOf(0);
  return new TextDecoder().decode(zero < 0 ? slice : slice.subarray(0, zero)).trim();
}

function unpackTar(bytes: Uint8Array): UnpackedArchiveEntry[] {
  const entries: UnpackedArchiveEntry[] = [];
  let pos = 0;
  while (pos + 512 <= bytes.length) {
    const header = bytes.subarray(pos, pos + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarCString(header, 0, 100);
    const prefix = readTarCString(header, 345, 155);
    const size = Number.parseInt(readTarCString(header, 124, 12), 8) || 0;
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]!);
    pos += 512;
    const fullName = (prefix ? `${prefix}/${name}` : name).replaceAll('\\', '/').replace(/^\/+/, '');
    if ((type === '0' || type === '') && fullName) {
      entries.push({ path: fullName, bytes: bytes.subarray(pos, pos + size).slice() });
    }
    pos += Math.ceil(size / 512) * 512;
  }
  return entries;
}

export async function unpackArchive(bytes: Uint8Array, filename: string): Promise<UnpackedArchiveEntry[]> {
  if (looksLikeTarGzName(filename) || (!sniffZip(bytes) && sniffGzip(bytes))) {
    return unpackTar(await gunzip(bytes));
  }
  if (sniffZip(bytes) || filename.toLowerCase().endsWith('.zip')) {
    return unpackZip(bytes);
  }
  if (sniffGzip(bytes)) return unpackTar(await gunzip(bytes));
  throw new Error('not a zip or tar.gz archive');
}
