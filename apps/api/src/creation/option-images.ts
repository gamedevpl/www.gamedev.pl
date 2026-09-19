// Generated tiles for the options of one visual CreatorQA question.

import { decodeWebp, encodeWebp } from '../platform/image-webp.js';
import { downscaleRgba } from '../platform/image-rgba.js';

export interface OptionImageOption {
  label: string;
  detail?: string;
}

export interface OptionImageParams {
  concept: string;
  question: string;
  options: OptionImageOption[];
}

export interface OptionImage {
  label: string;
  // A data URI, ready for a tile's `src`.
  image: string;
}

// Tiles are survey decoration: never stored, never sent to the builder.
export interface OptionImageGenerator {
  generate(params: OptionImageParams): Promise<OptionImage[]>;
}

export const DEFAULT_OPTION_IMAGE_BASE_URL = 'https://api.meta.ai/v1';

// Median 12.3s, worst measured call 24.8s.
export const DEFAULT_OPTION_IMAGE_TIMEOUT_MS = 30_000;

// 480px measured at 68-83KB for three tiles.
export const OPTION_IMAGE_WIDTH = 480;

// A survey with more tiles stops being scannable.
export const MAX_OPTION_IMAGES = 4;

export interface MuseOptionImageGeneratorOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  // Seam for tests; production leaves it to the global fetch.
  fetchImpl?: typeof fetch;
}

// Named-game leakage is the one failure a reviewer cannot undo later.
const IP_RULE = `The concept may name, credit or imitate an existing game. Never reproduce anything recognisable from it: no established characters, no character designs, no names of characters or items, no logos, no trademarked art. Invent original characters, original names and an original interface. Only the genre and the mechanics the concept describes may carry over.`;

// The platform builds one HTML file drawing procedurally on a 2D canvas.
const PLATFORM_RULE = `Every game here is a single HTML document that draws itself procedurally on a 2D canvas: flat fills, geometric shapes, a small consistent palette, no photographic or painted texture. Draw something this engine could actually render, so the picture does not promise art the builder cannot deliver.`;

function buildPrompt(params: OptionImageParams, option: OptionImageOption): string {
  const detail = option.detail ? `\nWhat that direction means: ${option.detail}` : '';
  return `Draw a single frame of this browser game already running — a screenshot of play in progress, not cover art, not an illustration, not a photograph.

Game concept:
"""
${params.concept}
"""

The creator is being asked: "${params.question}"
Draw the answer "${option.label}" as an art direction for the whole screen.${detail}

${PLATFORM_RULE}

${IP_RULE}

Composition: fill the entire frame edge to edge. No border, no frame, no matting, no drop shadow around the image, no letterboxing bars — this is the screen itself, not a picture hanging on a wall.

On-screen text: a game HUD belongs here. Score, timer, lives, combo counters and short labels are part of what the creator is judging, so draw them where the game would. Write every one of them in the same language as this text: "${option.label}". Keep them short and correctly spelled. Never print the option name as a caption, and never draw any part of these instructions as an interface element.`;
}

interface MuseImageResponse {
  data?: Array<{ b64_json?: string }>;
}

// Null on failure: a missing tile is a plain option.
async function toTile(bytes: Buffer): Promise<string | null> {
  const decoded = await decodeWebp(bytes);
  if (!decoded) return null;
  const scaled = downscaleRgba(decoded, OPTION_IMAGE_WIDTH);
  const encoded = await encodeWebp(scaled ?? decoded);
  if (!encoded) return null;
  return `data:image/webp;base64,${encoded.toString('base64')}`;
}

export class MuseOptionImageGenerator implements OptionImageGenerator {
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: MuseOptionImageGeneratorOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_OPTION_IMAGE_TIMEOUT_MS;
    this.baseUrl = options.baseUrl ?? DEFAULT_OPTION_IMAGE_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async one(params: OptionImageParams, option: OptionImageOption): Promise<OptionImage | null> {
    const response = await this.fetchImpl(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model,
        prompt: buildPrompt(params, option),
        n: 1,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`option image request failed: ${response.status}`);
    }

    const body = (await response.json()) as MuseImageResponse;
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) return null;

    const tile = await toTile(Buffer.from(b64, 'base64'));
    return tile ? { label: option.label, image: tile } : null;
  }

  // One slow option must not cost the creator the other two.
  async generate(params: OptionImageParams): Promise<OptionImage[]> {
    const wanted = params.options.slice(0, MAX_OPTION_IMAGES);
    const settled = await Promise.allSettled(wanted.map((option) => this.one(params, option)));

    const images: OptionImage[] = [];
    for (const [index, result] of settled.entries()) {
      if (result.status === 'fulfilled') {
        if (result.value) images.push(result.value);
        continue;
      }
      // Index, never the label: creator text must not be retained in logs.
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`option image ${index} failed (budget ${this.timeoutMs}ms):`, result.reason);
      }
    }
    return images;
  }
}

export interface OptionImageEnv {
  OPTION_IMAGE_API_KEY?: string;
  OPTION_IMAGE_MODEL?: string;
  OPTION_IMAGE_BASE_URL?: string;
  OPTION_IMAGE_TIMEOUT_MS?: string;
}

// Undefined leaves the feature off, which the route serves as "no tiles".
export function createOptionImageGeneratorFromEnv(env: OptionImageEnv = process.env): OptionImageGenerator | undefined {
  const apiKey = env.OPTION_IMAGE_API_KEY?.trim();
  const model = env.OPTION_IMAGE_MODEL?.trim();
  if (!apiKey || !model) return undefined;

  const baseUrl = env.OPTION_IMAGE_BASE_URL?.trim();
  const timeout = Number(env.OPTION_IMAGE_TIMEOUT_MS);
  return new MuseOptionImageGenerator({
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(Number.isFinite(timeout) && timeout > 0 ? { timeoutMs: timeout } : {}),
  });
}
