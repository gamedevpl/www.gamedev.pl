import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import type { RgbaImage } from './image-rgba.js';

// WebP for baked screenshots. See docs/deployment.md 'Media egress'.

// Indistinguishable on real screenshots; q90 costs 50% more for nothing.
export const WEBP_QUALITY = 80;

type Encoder = (image: RgbaImage, options: { quality: number }) => Promise<ArrayBuffer>;

// TypeScript resolves this subpath to `any`; naming the shape restores checking.
interface WebpEncodeModule {
  default: Encoder;
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

// The object beside the PNG, never a catalog filename.
export function webpObjectName(pngObjectName: string): string {
  return `${pngObjectName.replace(/\.png$/i, '')}.webp`;
}
