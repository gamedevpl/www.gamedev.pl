/*
 * Generates the installed-app icons from apps/web/src/logo-gamedev.png.
 *
 * Run this when the logo changes; the output is committed:
 *   node apps/web/scripts/generate-icons.mjs
 *
 * Zero-dependency on purpose, like precompress.mjs next door — node's zlib does the
 * whole job. The logo is a 70x60 pixel-art character, so every scale here is an
 * integer nearest-neighbour blowup: a bicubic resize (what `sips` would give us)
 * turns crisp pixel edges into mush at icon sizes.
 *
 * Every icon is drawn on the opaque brand background rather than left transparent.
 * iOS composites a transparent home-screen icon onto black, and a maskable icon with
 * transparent corners shows the launcher's own backplate through them — both read as
 * a mistake rather than a choice.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = dirname(here);
const source = join(webRoot, 'src', 'logo-gamedev.png');
const outputDir = join(webRoot, 'public', 'icons');

/** --bg in styles.css. */
const BACKGROUND = [0x0f, 0x14, 0x18];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Reads a non-interlaced 8-bit indexed PNG (what the logo is) into flat RGBA.
 * Narrow on purpose: this decodes our own asset, not arbitrary input.
 */
function decodeIndexedPng(bytes) {
  let offset = 8; // skip the signature
  let header;
  let palette;
  let transparency;
  const idat = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') transparency = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    offset += 12 + length;
  }

  if (!header || header.colorType !== 3 || header.bitDepth !== 8 || header.interlace !== 0 || !palette) {
    throw new Error('expected a non-interlaced 8-bit indexed PNG');
  }

  const { width, height } = header;
  const raw = inflateSync(Buffer.concat(idat));
  const indices = Buffer.alloc(width * height);
  let previous = Buffer.alloc(width);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (width + 1);
    const filter = raw[rowStart];
    const row = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + width));
    for (let x = 0; x < width; x++) {
      const left = x > 0 ? row[x - 1] : 0;
      const up = previous[x];
      const upLeft = x > 0 ? previous[x - 1] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`);
    }
    row.copy(indices, y * width);
    previous = row;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    rgba[i * 4] = palette[index * 3];
    rgba[i * 4 + 1] = palette[index * 3 + 1];
    rgba[i * 4 + 2] = palette[index * 3 + 2];
    rgba[i * 4 + 3] = transparency && index < transparency.length ? transparency[index] : 0xff;
  }
  return { width, height, rgba };
}

function encodeRgbaPng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none. These are tiny; nothing to gain.
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Centres the logo, scaled by `scale`, on an opaque `size`x`size` brand tile. */
function drawIcon(logo, size, scale) {
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = BACKGROUND[0];
    canvas[i * 4 + 1] = BACKGROUND[1];
    canvas[i * 4 + 2] = BACKGROUND[2];
    canvas[i * 4 + 3] = 0xff;
  }

  const drawnWidth = logo.width * scale;
  const drawnHeight = logo.height * scale;
  if (drawnWidth > size || drawnHeight > size) {
    throw new Error(`scale ${scale} overflows a ${size}px icon`);
  }
  const originX = Math.round((size - drawnWidth) / 2);
  const originY = Math.round((size - drawnHeight) / 2);

  for (let y = 0; y < drawnHeight; y++) {
    for (let x = 0; x < drawnWidth; x++) {
      const source = ((y / scale) | 0) * logo.width + ((x / scale) | 0);
      const alpha = logo.rgba[source * 4 + 3] / 255;
      if (alpha === 0) continue;
      const target = ((originY + y) * size + (originX + x)) * 4;
      for (let channel = 0; channel < 3; channel++) {
        // Source over the tile, so semi-transparent logo edges keep their shape.
        canvas[target + channel] = Math.round(logo.rgba[source * 4 + channel] * alpha + canvas[target + channel] * (1 - alpha));
      }
    }
  }
  return encodeRgbaPng(size, size, canvas);
}

const logo = decodeIndexedPng(readFileSync(source));

/*
 * `scale` is chosen per icon, not derived, because the two purposes want different
 * margins. A plain icon should fill its tile; a maskable one has to survive the
 * launcher cropping it to a circle, which keeps only the middle 80% — so its content
 * sits well inside that, at roughly 55% of the tile.
 */
const icons = [
  { file: 'icon-192.png', size: 192, scale: 2 },
  { file: 'icon-512.png', size: 512, scale: 6 },
  { file: 'icon-maskable-512.png', size: 512, scale: 4 },
  { file: 'apple-touch-icon.png', size: 180, scale: 2 },
];

for (const { file, size, scale } of icons) {
  const png = drawIcon(logo, size, scale);
  writeFileSync(join(outputDir, file), png);
  console.log(`${file}  ${size}x${size}  logo at ${scale}x  ${png.length} bytes`);
}
