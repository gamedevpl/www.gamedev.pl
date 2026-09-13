import { image, user, type GenAIClient } from 'genaicode';
import { createVertexClient, type VertexGenerationConfig } from '../platform/genai.js';

// One rectangle of the game's own UI, in screenshot pixels.
export interface HudRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export interface DreamFrameRequest {
  // The real gate capture, PNG as base64.
  sourcePng: string;
  width: number;
  height: number;
  // "a dark top-down horror game" — what the model is looking at.
  styleNote: string;
  // The change to draw, in English, as a creator would ask.
  direction: string;
  hudRegions: HudRegion[];
}

export interface DreamFrame {
  data: string;
  mediaType: 'image/png' | 'image/jpeg';
}

export interface DreamFrameGenerator {
  generate(request: DreamFrameRequest): Promise<DreamFrame | null>;
  // Named by whatever bills, so the ledger entry cannot drift.
  readonly model: string;
}

// Owner policy: 3.x only; VERTEX_MODEL must not leak in.
export const DEFAULT_DREAM_IMAGE_MODEL = 'gemini-3.1-flash-image';
export const DEFAULT_DREAM_TIMEOUT_MS = 60_000;

function describeRegion(region: HudRegion, index: number): string {
  const name = region.label ? `"${region.label}"` : `HUD element ${index + 1}`;
  return `- ${name}: the rectangle from x=${region.x}, y=${region.y} to x=${region.x + region.w}, y=${region.y + region.h}`;
}

// Spike 2 shape: name every HUD rectangle, lock it, change the world.
export function buildDreamPrompt(request: DreamFrameRequest): string {
  const intro = `This is a real ${request.width}x${request.height} screenshot of ${request.styleNote}. Generate a variation of this EXACT scene.

CHANGE: ${request.direction}
`;
  if (request.hudRegions.length === 0) {
    return `${intro}
Do not add any text, labels, numbers or UI of your own. Keep the exact art style, camera, proportions and aspect ratio of the original, and keep the output the same size as the input.`;
  }
  const regions = request.hudRegions.map(describeRegion).join('\n');
  return `${intro}
HUD LOCK RULE. The screenshot contains a heads-up display (HUD) — the game's own on-screen text and panels, listed below in pixel coordinates. Treat every HUD element as a locked, fully opaque top layer: reproduce it exactly — same text, same numbers, same position, same size, same colours — drawn ON TOP of everything else. Nothing you add or change may overlap, tint, blur, dim, or show through any HUD element, and you must not add any new text, labels, numbers or UI of your own. Change only the game world beneath the HUD. Keep the exact art style, camera, proportions and aspect ratio of the original, and keep the output the same size as the input.

HUD elements in this screenshot:
${regions}`;
}

export class VertexDreamFrameGenerator implements DreamFrameGenerator {
  private client?: GenAIClient;

  readonly model: string;

  constructor(
    private options: {
      client?: GenAIClient;
      projectId?: string;
      region?: string;
      model?: string;
      timeoutMs?: number;
    } = {},
  ) {
    this.model = options.model ?? process.env.DREAM_IMAGE_MODEL ?? DEFAULT_DREAM_IMAGE_MODEL;
  }

  private getClient(): GenAIClient {
    this.client ??=
      this.options.client ??
      createVertexClient({
        projectId: this.options.projectId,
        region: this.options.region,
        defaultRegion: 'global',
        model: this.model,
        defaultModel: DEFAULT_DREAM_IMAGE_MODEL,
        generationConfig: { responseModalities: ['IMAGE'] } as VertexGenerationConfig,
      });
    return this.client;
  }

  async generate(request: DreamFrameRequest): Promise<DreamFrame | null> {
    const prompt = buildDreamPrompt(request);
    const timeoutMs = this.options.timeoutMs ?? Number(process.env.DREAM_TIMEOUT_MS ?? DEFAULT_DREAM_TIMEOUT_MS);
    const result = await this.getClient()(user(prompt, { images: [image(request.sourcePng, 'image/png')] }))
      .signal(AbortSignal.timeout(timeoutMs))
      .run();
    for (const part of result.parts) {
      if (part.type !== 'image' || !part.image.data) continue;
      const mediaType = part.image.mediaType;
      if (mediaType === 'image/png' || mediaType === 'image/jpeg') {
        return { data: part.image.data, mediaType };
      }
    }
    return null;
  }
}

export class StubDreamFrameGenerator implements DreamFrameGenerator {
  public readonly requests: DreamFrameRequest[] = [];
  readonly model = DEFAULT_DREAM_IMAGE_MODEL;

  constructor(
    private frame: DreamFrame | null | ((request: DreamFrameRequest) => DreamFrame | null | Promise<DreamFrame | null>),
  ) {}

  async generate(request: DreamFrameRequest): Promise<DreamFrame | null> {
    this.requests.push(request);
    return typeof this.frame === 'function' ? await this.frame(request) : this.frame;
  }
}
