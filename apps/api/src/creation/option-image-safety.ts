// Safety verdict on a generated option tile, before any creator sees it.

import type { GenAIClient } from 'genaicode';
import { user, image as imagePart } from 'genaicode';
import { z } from 'zod';
// eslint-disable-next-line gamedev/metered-call -- gated by option-images route
import { createVertexClient } from '../platform/genai.js';

// The only media type the tile pipeline produces.
export const OPTION_IMAGE_MEDIA_TYPE = 'image/webp' as const;

export interface OptionImageSafetyChecker {
  // True only for a definite pass; anything else keeps the tile hidden.
  isSafe(image: Buffer): Promise<boolean>;
}

// A refusal must cost less than the generation that preceded it.
export const DEFAULT_SAFETY_TIMEOUT_MS = 10_000;

const VerdictSchema = z.object({ safe: z.boolean() });

const PROMPT = `You are a content-safety classifier for images shown inside a game-creation tool.

The image is a generated illustration of one answer to a question a creator was asked about how their game should look. It will be shown to that creator as a small tile.

Answer with JSON only: {"safe": true} or {"safe": false}.

Mark it unsafe if it contains any of: sexual or suggestive content; nudity; gore or graphic violence; hateful symbols or imagery; harassment or degradation of a person or group; self-harm; illegal drugs; content sexualising or endangering minors; or a recognisable real person.

Stylised cartoon action typical of video games — a character jumping, a projectile, a cartoon explosion, an abstract hazard — is safe. Judge the picture, not the genre.

If you cannot tell, answer {"safe": false}.`;

export interface VertexOptionImageSafetyCheckerOptions {
  projectId?: string;
  region?: string;
  model?: string;
  timeoutMs?: number;
  // Seam for tests, same discipline as VertexChecker.
  client?: GenAIClient;
}

// One call per generated tile, so the route's gate bounds both.
export class VertexOptionImageSafetyChecker implements OptionImageSafetyChecker {
  private readonly timeoutMs: number;
  private client?: GenAIClient;

  constructor(private readonly options: VertexOptionImageSafetyCheckerOptions = {}) {
    this.timeoutMs =
      options.timeoutMs ?? Number(process.env.OPTION_IMAGE_SAFETY_TIMEOUT_MS ?? DEFAULT_SAFETY_TIMEOUT_MS);
  }

  // Lazy for the same reason as VertexChecker: constructing must not touch GCP.
  private getClient(): GenAIClient {
    this.client ??=
      this.options.client ??
      createVertexClient({
        projectId: this.options.projectId,
        region: this.options.region,
        defaultRegion: 'global',
        defaultModel: 'gemini-3.5-flash-lite',
        ...(this.options.model ? { model: this.options.model } : {}),
      });
    return this.client;
  }

  // Fail closed: a timeout or a bad body hides the tile.
  async isSafe(image: Buffer): Promise<boolean> {
    try {
      const verdict = await this.getClient()(
        user(PROMPT, { images: [imagePart(image.toString('base64'), OPTION_IMAGE_MEDIA_TYPE)] }),
      )
        .temperature(0)
        // Omitting this sends MINIMAL under `.json()`, which 3.8-flash rejects.
        .thinking({ level: 'low' })
        .signal(AbortSignal.timeout(Math.max(1, this.timeoutMs)))
        .json((value) => VerdictSchema.parse(value));
      return verdict.safe;
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`option image safety check failed (budget ${this.timeoutMs}ms):`, err);
      }
      return false;
    }
  }
}
