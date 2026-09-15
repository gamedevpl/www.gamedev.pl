import { describe, expect, it } from 'vitest';
import { decodeWebp, encodeWebp } from '../platform/image-webp.js';
import {
  createOptionImageGeneratorFromEnv,
  MAX_OPTION_IMAGES,
  MuseOptionImageGenerator,
  OPTION_IMAGE_WIDTH,
  type OptionImageParams,
} from './option-images.js';

const PARAMS: OptionImageParams = {
  concept: 'Dodge the falling rocks and survive as long as possible, inspired by Ace Attorney (2001)',
  question: 'Jaki styl graficzny ma mieć gra?',
  options: [
    { label: 'Pixel Art', detail: 'Klasyczna retro grafika' },
    { label: 'Minimalistyczny 2D', detail: 'Proste figury geometryczne' },
    { label: 'Rysunkowy', detail: 'Kolorowe tła' },
  ],
};

// A real encode, so the downscale path is exercised rather than mocked.
async function sourceImage(width = 1200, height = 896): Promise<string> {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) << 2;
      data[i] = (x * 255) / width;
      data[i + 1] = (y * 255) / height;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  const encoded = await encodeWebp({ data, width, height });
  if (!encoded) throw new Error('fixture encode failed');
  return encoded.toString('base64');
}

function respondWith(b64: string): Response {
  return new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGenerator(fetchImpl: typeof fetch, timeoutMs = 5_000) {
  return new MuseOptionImageGenerator({ apiKey: 'k', model: 'muse-image-1.0', fetchImpl, timeoutMs });
}

describe('MuseOptionImageGenerator', () => {
  it('returns one downscaled webp tile per option', async () => {
    const b64 = await sourceImage();
    const generator = makeGenerator(async () => respondWith(b64));

    const images = await generator.generate(PARAMS);

    expect(images.map((image) => image.label)).toEqual(['Pixel Art', 'Minimalistyczny 2D', 'Rysunkowy']);
    for (const image of images) {
      expect(image.image.startsWith('data:image/webp;base64,')).toBe(true);
      const decoded = await decodeWebp(Buffer.from(image.image.split(',')[1]!, 'base64'));
      expect(decoded?.width).toBe(OPTION_IMAGE_WIDTH);
    }
  });

  it('leaves an image that is already small enough alone', async () => {
    const b64 = await sourceImage(320, 240);
    const generator = makeGenerator(async () => respondWith(b64));

    const [image] = await generator.generate({ ...PARAMS, options: [{ label: 'Pixel Art' }] });

    const decoded = await decodeWebp(Buffer.from(image!.image.split(',')[1]!, 'base64'));
    expect(decoded?.width).toBe(320);
  });

  it('asks for every option at once rather than one after another', async () => {
    const b64 = await sourceImage(320, 240);
    let inFlight = 0;
    let peak = 0;
    const generator = makeGenerator(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return respondWith(b64);
    });

    await generator.generate(PARAMS);

    expect(peak).toBe(3);
  });

  it('keeps the other tiles when one option fails', async () => {
    const b64 = await sourceImage(320, 240);
    const generator = makeGenerator(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { prompt?: string };
      return body.prompt?.includes('Minimalistyczny 2D') ? new Response('nope', { status: 500 }) : respondWith(b64);
    });

    const images = await generator.generate(PARAMS);

    expect(images.map((image) => image.label)).toEqual(['Pixel Art', 'Rysunkowy']);
  });

  it('never illustrates more options than the cap allows', async () => {
    const b64 = await sourceImage(320, 240);
    let calls = 0;
    const generator = makeGenerator(async () => {
      calls += 1;
      return respondWith(b64);
    });

    const options = Array.from({ length: MAX_OPTION_IMAGES + 3 }, (_, i) => ({ label: `Option ${i}` }));
    await generator.generate({ ...PARAMS, options });

    expect(calls).toBe(MAX_OPTION_IMAGES);
  });

  it('tells the model to invent its own characters for a concept that names a game', async () => {
    const b64 = await sourceImage(320, 240);
    let prompt = '';
    const generator = makeGenerator(async (_url, init) => {
      prompt = JSON.parse(String(init?.body ?? '{}')).prompt;
      return respondWith(b64);
    });

    await generator.generate({ ...PARAMS, options: [{ label: 'Pixel Art' }] });

    expect(prompt).toContain('Never reproduce anything recognisable');
    expect(prompt).toContain('2D canvas');
    expect(prompt).toContain('not cover art');
    // The HUD language follows the option label.
    expect(prompt).toContain('Pixel Art');
  });
});

describe('createOptionImageGeneratorFromEnv', () => {
  it('stays off until both the key and the model are set', () => {
    expect(createOptionImageGeneratorFromEnv({})).toBeUndefined();
    expect(createOptionImageGeneratorFromEnv({ OPTION_IMAGE_API_KEY: 'k' })).toBeUndefined();
    expect(createOptionImageGeneratorFromEnv({ OPTION_IMAGE_MODEL: 'm' })).toBeUndefined();
  });

  it('builds a generator once both are present', () => {
    const generator = createOptionImageGeneratorFromEnv({ OPTION_IMAGE_API_KEY: 'k', OPTION_IMAGE_MODEL: 'm' });
    expect(generator).toBeInstanceOf(MuseOptionImageGenerator);
  });
});
