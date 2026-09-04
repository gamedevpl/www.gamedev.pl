import type { GenAIClient } from 'genaicode';
import { z } from 'zod';
import { createVertexClient, type VertexGenerationConfig } from './genai.js';
import { sanitizeCreatorText } from './submission-status.js';
import { normalizeLocale } from './translate.js';

// Layer-2 idea chips; generation always fails open.

const LANGUAGE_NAMES: Record<string, string> = {
  pl: 'Polish',
  en: 'English',
};

export interface NextIdea {
  // Stable only within one generation batch, not across regenerations.
  id: string;
  label: { en: string; pl: string };
  prompt: { en: string; pl: string };
}

export interface NextIdeasParams {
  // Already sanitized and moderated once, at original submission time.
  spec: string;
  // Answers from the clarifying-questions panel, if given.
  qa?: string[];
  title?: string;
  // True flips "next build" framing to "next thing for the live game".
  published: boolean;
  locale?: string;
}

export interface NextIdeaGenerator {
  generate(params: NextIdeasParams): Promise<NextIdea[]>;
}

export const DEFAULT_NEXT_IDEAS_TIMEOUT_MS = 8_000;
export const MAX_NEXT_IDEAS = 3;

const NextIdeaResultSchema = z.object({
  ideas: z
    .array(
      z.object({
        label: z.object({ en: z.string(), pl: z.string() }).partial(),
        prompt: z.object({ en: z.string(), pl: z.string() }).partial(),
      }),
    )
    .optional(),
});

function cleanBilingual(
  raw: { en?: string; pl?: string } | undefined,
  maxLength: number,
): { en: string; pl: string } | null {
  const en = sanitizeCreatorText(raw?.en ?? '', { singleLine: true })
    .slice(0, maxLength)
    .trim();
  const pl = sanitizeCreatorText(raw?.pl ?? '', { singleLine: true })
    .slice(0, maxLength)
    .trim();
  if (!en || !pl) return null;
  return { en, pl };
}

const MAX_LABEL_LENGTH = 60;
const MAX_PROMPT_LENGTH = 300;

export interface VertexNextIdeaGeneratorOptions {
  projectId?: string;
  region?: string;
  model?: string;
  timeoutMs?: number;
  client?: GenAIClient;
}

export class VertexNextIdeaGenerator implements NextIdeaGenerator {
  private options: VertexNextIdeaGeneratorOptions;
  private timeoutMs: number;
  private client?: GenAIClient;

  constructor(options: VertexNextIdeaGeneratorOptions = {}) {
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? Number(process.env.NEXT_IDEAS_TIMEOUT_MS ?? DEFAULT_NEXT_IDEAS_TIMEOUT_MS);
  }

  private getClient(): GenAIClient {
    this.client ??=
      this.options.client ??
      createVertexClient({
        projectId: this.options.projectId,
        region: this.options.region,
        defaultRegion: 'global',
        model: this.options.model,
        defaultModel: 'gemini-3.7-flash',
        generationConfig: {
          responseMimeType: 'application/json',
        } as VertexGenerationConfig,
      });
    return this.client;
  }

  async generate(params: NextIdeasParams): Promise<NextIdea[]> {
    try {
      const locale = normalizeLocale(params.locale);
      const languageName = LANGUAGE_NAMES[locale] ?? 'English';
      const stageNote = params.published
        ? 'This game is already published and live. Propose the next thing worth building for it.'
        : "This is the creator's first delivered version, not yet published. Propose the next thing worth building before they publish.";

      const promptText = `You are a game design assistant for gamedev.pl, suggesting what a creator could ask their build agent for next.

${stageNote}

Propose up to ${MAX_NEXT_IDEAS} concrete, distinct next steps. Each must be:
- Something a single build round could plausibly finish — never "add multiplayer" or "rebuild the engine".
- Specific enough to act on immediately, not a vague direction like "make it more fun".
- Genuinely different from the others (do not propose three variations of the same idea).

Write both a short "label" (what a button says, at most 8 words) and a fuller "prompt" (what the creator would actually ask for, one or two sentences, as if they typed it themselves) for each idea, in BOTH English and Polish.

Respond STRICTLY with a JSON object following this schema:
{
  "ideas": [
    { "label": { "en": "...", "pl": "..." }, "prompt": { "en": "...", "pl": "..." } }
  ]
}

If nothing sensible comes to mind for this concept, return an empty "ideas" array rather than inventing filler.

Reference language for your own understanding: the creator's UI is in ${languageName}, but you must still write both "en" and "pl" for every idea regardless.
${params.title ? `\nGame title: "${params.title}"\n` : ''}
Game concept:
"""
${params.spec}
"""
${params.qa?.length ? `\nClarifications the creator already gave:\n${params.qa.map((line) => `- ${line}`).join('\n')}\n` : ''}`;

      const parsed = await this.getClient()(promptText)
        .temperature(0.4)
        .thinking({ level: 'low' })
        .signal(AbortSignal.timeout(this.timeoutMs))
        .json((value) => NextIdeaResultSchema.parse(value));

      const ideas: NextIdea[] = [];
      for (const [idx, raw] of (parsed.ideas ?? []).entries()) {
        const label = cleanBilingual(raw.label, MAX_LABEL_LENGTH);
        const prompt = cleanBilingual(raw.prompt, MAX_PROMPT_LENGTH);
        if (!label || !prompt) continue;
        ideas.push({ id: `idea_${idx}`, label, prompt });
        if (ideas.length >= MAX_NEXT_IDEAS) break;
      }
      return ideas;
    } catch (err) {
      // Fail open: never surface a generation failure as an error.
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`Vertex AI next-idea generation failed/timed out (budget ${this.timeoutMs}ms):`, err);
      }
      return [];
    }
  }
}

export class StubNextIdeaGenerator implements NextIdeaGenerator {
  constructor(private ideas: NextIdea[] = []) {}

  async generate(): Promise<NextIdea[]> {
    return this.ideas;
  }
}
