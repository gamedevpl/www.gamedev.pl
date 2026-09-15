import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import type { RgbaImage } from './image-rgba.js';

// WebP for baked screenshots. See docs/deployment.md 'Media egress'.

// Indistinguishable on real screenshots; q90 costs 50% more for nothing.
export const WEBP_QUALITY = 80;

type Encoder = (image: RgbaImage, options: { quality: number }) => Promise<ArrayBuffer>;

// Package typings lean on DOM globals we lack; these degrade to any.
interface WebpEncodeModule {
  default: Encoder;
  init(options: { wasmBinary: Buffer }): Promise<unknown>;
}

interface WebpDecodeModule {
  default: (bytes: ArrayBuffer) => Promise<RgbaImage>;
  init(options: { wasmBinary: Buffer }): Promise<unknown>;
}

let encoder: Promise<Encoder | null> | null = null;

async function loadEncoder(): Promise<Encoder | null> {
  try {
    const [module, { simd }] = await Promise.all([
      import('@jsquash/webp/encode.js') as Promise<WebpEncodeModule>,
      import('wasm-feature-detect'),
    ]);
    // Same check the glue uses, so the binary matches it.
    const file = (await simd()) ? 'webp_enc_simd.wasm' : 'webp_enc.wasm';
    const require = createRequire(import.meta.url);
    const wasmBinary = await readFile(require.resolve(`@jsquash/webp/codec/enc/${file}`));
    await module.init({ wasmBinary });
    return module.default;
  } catch {
    return null;
  }
}

// Null, never throwing: a lost copy beats a lost bake.
export async function encodeWebp(image: RgbaImage, quality: number = WEBP_QUALITY): Promise<Buffer | null> {
  encoder ??= loadEncoder();
  const encode = await encoder;
  if (!encode) return null;
  try {
    return Buffer.from(await encode(image, { quality }));
  } catch {
    return null;
  }
}

type Decoder = (bytes: ArrayBuffer) => Promise<RgbaImage>;

let decoder: Promise<Decoder | null> | null = null;

async function loadDecoder(): Promise<Decoder | null> {
  try {
    const module = (await import('@jsquash/webp/decode.js')) as unknown as WebpDecodeModule;
    const require = createRequire(import.meta.url);
    const wasmBinary = await readFile(require.resolve('@jsquash/webp/codec/dec/webp_dec.wasm'));
    await module.init({ wasmBinary });
    return module.default;
  } catch {
    return null;
  }
}

// Memoised like the encoder: option images decode three per request.
export async function decodeWebp(bytes: Buffer): Promise<RgbaImage | null> {
  decoder ??= loadDecoder();
  const decode = await decoder;
  if (!decode) return null;
  try {
    const out = await decode(Uint8Array.from(bytes).buffer);
    return { data: new Uint8ClampedArray(out.data), width: out.width, height: out.height };
  } catch {
    return null;
  }
}

// The object beside the PNG, never a catalog filename.
export function webpObjectName(pngObjectName: string): string {
  return `${pngObjectName.replace(/\.png$/i, '')}.webp`;
}
