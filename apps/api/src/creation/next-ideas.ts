import { image, user, type GenAIClient } from 'genaicode';
import { z } from 'zod';
import { createAnthropicClient, resolveAnthropicApiKey } from '../platform/genai-anthropic.js';
import { createVertexClient, type VertexGenerationConfig } from '../platform/genai.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { normalizeLocale } from '../platform/translate.js';
import { callWithVertexResilience } from '../platform/vertex-resilience.js';

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
  // The game as it looks now, base64 PNG.
  screenshotPng?: string;
  // Recent round notes, oldest first: what was asked and delivered.
  history?: string[];
  // Every billed call, first included, named by the model that ran.
  onAttempt?: (model: string) => void;
}

export interface NextIdeaGenerator {
  generate(params: NextIdeasParams): Promise<NextIdea[]>;
  // The primary model; onAttempt names each call that billed.
  readonly model: string;
}

// Async dream job; an image prompt ran past 8s.
export const DEFAULT_NEXT_IDEAS_TIMEOUT_MS = 45_000;
export const MAX_NEXT_IDEAS = 3;
// Won a blind benchmark on 12 games; DREAM_IDEAS_MODEL switches back.
export const DEFAULT_NEXT_IDEAS_MODEL = 'claude-sonnet-5-5';
// Owner policy: Gemini 3.x only, never 2.x.
export const NEXT_IDEAS_GEMINI_MODEL = 'gemini-3.8-flash';

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

export interface NextIdeaModelGeneratorOptions {
  projectId?: string;
  region?: string;
  model?: string;
  timeoutMs?: number;
  anthropicApiKey?: string;
  // Tests inject fakes here; the default builds one client per model.
  clientFor?: (model: string) => GenAIClient;
  env?: NodeJS.ProcessEnv;
}

const isClaude = (model: string) => model.startsWith('claude-');

let warnedNoAnthropicKey = false;

// Claude primary needs a key; without one Gemini runs alone.
function resolvePrimaryModel(requested: string, apiKey: string | undefined): string {
  if (isClaude(requested) && !apiKey) {
    if (!warnedNoAnthropicKey && process.env.NODE_ENV !== 'test') {
      console.warn(`No Anthropic key for ${requested}; next ideas use ${NEXT_IDEAS_GEMINI_MODEL}.`);
    }
    warnedNoAnthropicKey = true;
    return NEXT_IDEAS_GEMINI_MODEL;
  }
  if (isClaude(requested) || requested.startsWith('gemini-')) return requested;
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`Unknown next-ideas model ${requested}; using ${NEXT_IDEAS_GEMINI_MODEL}.`);
  }
  return NEXT_IDEAS_GEMINI_MODEL;
}

// Claude via Anthropic, Gemini via Vertex; Gemini backs Claude up.
export class NextIdeaModelGenerator implements NextIdeaGenerator {
  private options: NextIdeaModelGeneratorOptions;
  private timeoutMs: number;
  private apiKey?: string;
  private clients = new Map<string, GenAIClient>();

  // The primary; the ledger takes each attempt's own model.
  readonly model: string;
  readonly fallbackModel?: string;

  constructor(options: NextIdeaModelGeneratorOptions = {}) {
    const env = options.env ?? process.env;
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? Number(env.NEXT_IDEAS_TIMEOUT_MS ?? DEFAULT_NEXT_IDEAS_TIMEOUT_MS);
    this.apiKey = options.anthropicApiKey ?? resolveAnthropicApiKey(env);
    // VERTEX_MODEL no longer reaches here: it names other call sites' Gemini.
    const requested = options.model ?? (env.DREAM_IDEAS_MODEL?.trim() || DEFAULT_NEXT_IDEAS_MODEL);
    this.model = resolvePrimaryModel(requested, this.apiKey);
    if (isClaude(this.model)) this.fallbackModel = NEXT_IDEAS_GEMINI_MODEL;
  }

  private clientFor(model: string): GenAIClient {
    if (this.options.clientFor) return this.options.clientFor(model);
    let client = this.clients.get(model);
    if (!client) {
      client = isClaude(model)
        ? createAnthropicClient({ model, apiKey: this.apiKey })
        : createVertexClient({
            projectId: this.options.projectId,
            region: this.options.region,
            defaultRegion: 'global',
            model,
            defaultModel: NEXT_IDEAS_GEMINI_MODEL,
            generationConfig: {
              responseMimeType: 'application/json',
            } as VertexGenerationConfig,
          });
      this.clients.set(model, client);
    }
    return client;
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
- New to this game. The concept below is only the starting point: the game has grown since. If a screenshot or recent rounds are given, treat what they show as already built and never propose it again — extend or deepen it instead.
- Visible in the game world. An artist will repaint the screenshot to show each idea while keeping the game's interface untouched, so prefer changes to what is on the field (units, terrain, effects, enemies, weather, level layout) over ideas that are only a new menu, meter or HUD panel.
- Something a single build round could plausibly finish — never "add multiplayer" or "rebuild the engine".
- One focused change a builder can finish in a single round: one new unit, effect, hazard or system — not several combined.
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
${params.qa?.length ? `\nClarifications the creator already gave:\n${params.qa.map((line) => `- ${line}`).join('\n')}\n` : ''}${params.history?.length ? `\nRecent rounds, oldest first (already built or asked for):\n${params.history.map((line) => `- ${line}`).join('\n')}\n` : ''}${params.screenshotPng ? '\nThe attached image is a real screenshot of the game as it is now.\n' : ''}`;

      const request = params.screenshotPng
        ? user(promptText, { images: [image(params.screenshotPng, 'image/png')] })
        : promptText;
      const draw = (model: string, budgetMs: number) =>
        this.clientFor(model)(request)
          .temperature(0.4)
          .thinking({ level: 'low' })
          .signal(AbortSignal.timeout(budgetMs))
          .json((value) => NextIdeaResultSchema.parse(value));
      let fellBack = false;
      // Malformed JSON or a capacity blip earns one more draw.
      const parsed = await callWithVertexResilience({
        // The first draw gets 60%; keep it above the budget.
        timeoutMs: this.timeoutMs * 2,
        ...(this.fallbackModel ? { fallbackModel: this.fallbackModel } : {}),
        onAttempt: (model) => {
          if (model) fellBack = true;
          params.onAttempt?.(model ?? this.model);
        },
        attempt: (model, budgetMs) => draw(model ?? this.model, budgetMs),
      }).catch(async (error: unknown) => {
        // A bad key or request skips the retry loop; Gemini still answers.
        if (!this.fallbackModel || fellBack) throw error;
        params.onAttempt?.(this.fallbackModel);
        return draw(this.fallbackModel, this.timeoutMs);
      });

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
        console.warn(`Next-idea generation failed/timed out (${this.model}, budget ${this.timeoutMs}ms):`, err);
      }
      return [];
    }
  }
}

export class StubNextIdeaGenerator implements NextIdeaGenerator {
  public readonly requests: NextIdeasParams[] = [];
  readonly model = DEFAULT_NEXT_IDEAS_MODEL;

  constructor(private ideas: NextIdea[] = []) {}

  async generate(params: NextIdeasParams): Promise<NextIdea[]> {
    this.requests.push(params);
    params.onAttempt?.(this.model);
    return this.ideas;
  }
}
