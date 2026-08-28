import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { unpackArchive } from './codeSurfaceArchive.js';

const TAR_BLOCK = 512;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function storedZip(files: Record<string, string>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(body);
    const crc = crc32(data);
    const local = [
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ];
    const localBytes = concat(local);
    locals.push(localBytes);
    centrals.push(
      concat([
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += localBytes.length;
  }
  const central = concat(centrals);
  const eocd = concat([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(Object.keys(files).length),
    u16(Object.keys(files).length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, central, eocd]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function tarGz(files: Record<string, string>): Uint8Array {
  const chunks: Buffer[] = [];
  for (const [name, body] of Object.entries(files)) {
    const header = Buffer.alloc(TAR_BLOCK);
    header.write(name, 0, 100, 'utf8');
    const payload = Buffer.from(body, 'utf8');
    header.write(payload.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8');
    header.write('0', 156, 1, 'utf8');
    header.write('ustar\0', 257, 6, 'utf8');
    header.write('00', 263, 2, 'utf8');
    let checksum = 0;
    header.fill(0x20, 148, 156);
    for (const byte of header) checksum += byte;
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
    chunks.push(header, payload, Buffer.alloc(Math.ceil(payload.length / TAR_BLOCK) * TAR_BLOCK - payload.length));
  }
  chunks.push(Buffer.alloc(TAR_BLOCK * 2));
  return new Uint8Array(gzipSync(Buffer.concat(chunks)));
}

describe('codeSurfaceArchive', () => {
  it('unpacks stored zip entries', async () => {
    const bytes = storedZip({ 'game.ts': 'export const boot = () => {};\n', 'SPEC.md': '# spec\n' });
    const entries = await unpackArchive(bytes, 'game.zip');
    expect(entries.map((entry) => entry.path).sort()).toEqual(['SPEC.md', 'game.ts']);
    expect(new TextDecoder().decode(entries.find((entry) => entry.path === 'game.ts')!.bytes)).toContain('boot');
  });

  it('refuses an entry larger than the unpack cap', async () => {
    const bytes = storedZip({ 'game.ts': 'export const boot = () => {};\n' });
    await expect(unpackArchive(bytes, 'game.zip', { maxEntryBytes: 4, maxBytes: 4, maxEntries: 8 })).rejects.toThrow(
      /too large/,
    );
  });

  it('unpacks tar.gz entries', async () => {
    const bytes = tarGz({ 'entities/player.ts': 'export {};\n' });
    const entries = await unpackArchive(bytes, 'tree.tar.gz');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe('entities/player.ts');
  });
});
