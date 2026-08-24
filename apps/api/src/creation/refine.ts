import { MAX_TITLE_LENGTH } from '@gamedevpl/contract';
import { createHash } from 'node:crypto';
import type { GenAIClient } from 'genaicode';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { checkUserAccess } from '../platform/auth.js';
import { createVertexClient, type VertexGenerationConfig } from '../platform/genai.js';
import type { ContentChecker } from '../platform/moderation.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { BOT_UID_PREFIX, type Store } from '../platform/store.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import { normalizeLocale } from '../platform/translate.js';

/** Full names the model is asked to write in — a bare `pl` tag is easy to ignore. */
const LANGUAGE_NAMES: Record<string, string> = {
  pl: 'Polish',
  en: 'English',
};

export interface RefineOption {
  label: string;
  detail?: string;
}

export interface RefineQuestion {
  id: string;
  question: string;
  options: RefineOption[];
  allowFreeText?: boolean;
  /** The options combine rather than compete ("which mechanics?"), so the UI accumulates. */
  multiple?: boolean;
}

export interface RefineResponse {
  questions: RefineQuestion[];
  /**
   * A name for the game, in the creator's language.
   *
   * Games used to be named by truncation — the first 40 characters of the prompt, cut
   * mid-word — and that string became the title everywhere: the studio, the catalog, the
   * agent's brief. The model is already reading the concept to write its questions, so
   * naming it costs nothing extra; the creator confirms or replaces it before anything
   * is built. Absent only when the model itself declines — a failed call throws.
   */
  suggestedTitle?: string;
}

export interface RefineParams {
  /**
   * A name the creator already has in mind. Optional: the flow that calls this has not
   * asked for one yet — that is what `suggestedTitle` is for — and seeding the model
   * with a truncated fragment of the concept only anchored it on the truncation.
   */
  title?: string;
  concept: string;
  locale?: string;
}

export interface SpecRefiner {
  refine(params: RefineParams): Promise<RefineResponse>;
}

export interface VertexSpecRefinerOptions {
  projectId?: string;
  region?: string;
  model?: string;
  timeoutMs?: number;
  groundingTimeoutMs?: number;
  refinerFetcher?: (params: RefineParams) => Promise<RefineResponse>;
  // Lower-level seam than `refinerFetcher` — see VertexCheckerOptions.client.
  client?: GenAIClient;
  groundingClient?: GenAIClient;
}

// Moderation's 5s is right for a one-token verdict; refinement has to author up to
// four questions with labelled options *and* per-option detail text, in the
// creator's language. Prod logs (2026-07-24 21:56Z and 23:05Z) show both real
// attempts after the model fix aborting on the old 5s budget, so the panel has
// never rendered a question. Env-tunable so the ceiling can move without a deploy.
export const DEFAULT_REFINE_TIMEOUT_MS = 20_000;

export const DEFAULT_GROUNDING_TIMEOUT_MS = 6_000;

/**
 * How long an answered spec stays free to re-ask, and how many are held. Short
 * enough that an edited concept is never served a stale answer for long; the cap
 * bounds memory on a single Cloud Run instance (4KB concepts, so ~1MB at worst).
 */
const REFINE_CACHE_TTL_MS = 10 * 60_000;
const REFINE_CACHE_MAX_ENTRIES = 200;

/**
 * The submission route's own title bounds. A suggestion that could not be submitted
 * unedited is worse than no suggestion: the creator would meet the validation error on
 * a name they never wrote.
 */
const MIN_TITLE_LENGTH = 3;

/**
 * A model-proposed title, or undefined when there is nothing usable.
 *
 * The model is asked for a bare name and mostly gives one, but it also sometimes wraps
 * it in quotes or ends it with a full stop, and a title is about to be shown in a text
 * input and then carried by the game forever. Single-lined here rather than at the
 * route because every caller of a refiner wants the same thing, stubs included.
 */
function cleanSuggestedTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = sanitizeCreatorText(raw, { singleLine: true })
    .replace(/^["'“”„«»]+|["'“”„«»]+$/g, '')
    .replace(/[.!?,;:]+$/, '')
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
  return cleaned.length >= MIN_TITLE_LENGTH ? cleaned : undefined;
}

const RefineResultSchema = z.object({
  suggestedTitle: z.string().optional(),
  questions: z
    .array(
      z.object({
        id: z.string().optional(),
        question: z.string().optional(),
        options: z.array(z.object({ label: z.string(), detail: z.string().optional() })).optional(),
        allowFreeText: z.boolean().optional(),
        multiple: z.boolean().optional(),
      }),
    )
    .optional(),
});

export class VertexSpecRefiner implements SpecRefiner {
  private options: VertexSpecRefinerOptions;
  private timeoutMs: number;
  private groundingTimeoutMs: number;
  private refinerFetcher?: (params: RefineParams) => Promise<RefineResponse>;
  // Lazy for the same reason as VertexChecker: building one must not touch GCP.
  private client?: GenAIClient;
  private groundingClient?: GenAIClient;

  constructor(options: VertexSpecRefinerOptions = {}) {
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? Number(process.env.REFINE_TIMEOUT_MS ?? DEFAULT_REFINE_TIMEOUT_MS);
    this.groundingTimeoutMs =
      options.groundingTimeoutMs ?? Number(process.env.REFINE_GROUNDING_TIMEOUT_MS ?? DEFAULT_GROUNDING_TIMEOUT_MS);
    this.refinerFetcher = options.refinerFetcher;
  }

  private getClient(): GenAIClient {
    this.client ??=
      this.options.client ??
      createVertexClient({
        projectId: this.options.projectId,
        // Was europe-west1/gemini-1.5-flash-8b, which Vertex 404s — that model is
        // retired in that region, so refinement fail-open'd to zero questions on
        // every request. Same global endpoint + model as moderation now: verified
        // against real Vertex, and it keeps VERTEX_REGION/VERTEX_MODEL (shared by
        // both call sites) meaningful instead of only valid for one of them.
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

  private getGroundingClient(): GenAIClient {
    this.groundingClient ??=
      this.options.groundingClient ??
      createVertexClient({
        projectId: this.options.projectId,
        region: this.options.region,
        defaultRegion: 'global',
        model: this.options.model,
        defaultModel: 'gemini-3.7-flash',
      });
    return this.groundingClient;
  }

  // Fail-open, same as `refine`.
  private async groundConcept(concept: string, languageName: string): Promise<string> {
    try {
      const groundingPrompt = `You are a fact-lookup tool, not a game designer. The idea below may reference a specific real, already-existing game or franchise by name — directly, or as "a clone of X", "like X", "X but Y", or similar. It may also be a wholly original idea in the creator's own words with no such reference.

If it references a specific real existing game by name in any of those ways, use web search and reply with one or two sentences, in ${languageName}, stating that real game's actual genre and core mechanics — so a design assistant can ask about it accurately instead of guessing from the name alone. Report only researched facts; do not invent, brainstorm, or design anything, and do not describe the creator's own idea back to them.

If it does not reference any specific real existing game by name, reply with exactly and only the single word: NONE
Do not explain your reasoning. Do not add anything else when replying NONE.

Idea:
"""
${concept}
"""`;
      const text = await this.getGroundingClient()(groundingPrompt)
        .temperature(0.2)
        .thinking({ level: 'low' })
        .search(true)
        .signal(AbortSignal.timeout(this.groundingTimeoutMs))
        .text();
      const trimmed = text.trim();
      return trimmed && trimmed.toUpperCase() !== 'NONE' ? trimmed : '';
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`Vertex AI concept grounding failed/timed out (budget ${this.groundingTimeoutMs}ms):`, err);
      }
      return '';
    }
  }

  async refine(params: RefineParams): Promise<RefineResponse> {
    if (this.refinerFetcher) {
      return this.refinerFetcher(params);
    }

    try {
      // Resolve to a language *name*: models routinely echo English when the concept
      // is English and the instruction only says `(pl)`. The UI language wins even
      // when the creator typed their idea in another language.
      const locale = normalizeLocale(params.locale);
      const languageName = LANGUAGE_NAMES[locale] ?? 'English';
      const groundingNote = await this.groundConcept(params.concept, languageName);

      const promptText = `You are a helpful game design assistant for gamedev.pl.
Analyze the following game concept specification.

Do two things:
1. Propose "suggestedTitle": a short, catchy name for this game — at most 6 words, no quotes, no trailing punctuation. Name the game, do not describe it, and never echo the concept text back as a sentence.
2. Identify up to 4 underspecified or missing gameplay/design dimensions (such as visual style, controls, difficulty/pacing, or win/lose conditions) that would help a coding agent build a better game.

Language requirement (mandatory): Write suggestedTitle, every question, every option label, and every option detail entirely in ${languageName}. The game concept below may be written in a different language — ignore that and still write all of your output in ${languageName}. Do not mix languages. Proper nouns from the concept may stay as-is.

Respond STRICTLY with a JSON object following this schema:
{
  "suggestedTitle": "Short Game Name",
  "questions": [
    {
      "id": "short_unique_id",
      "question": "Clear question text?",
      "options": [
        { "label": "Option Name", "detail": "Brief explanation" }
      ],
      "allowFreeText": true,
      "multiple": false
    }
  ]
}

Set "multiple": true only when the options genuinely combine rather than compete — "which mechanics should be in?" can take several, "which visual style?" cannot. Default to false.

If the concept is already fully specified, return an empty "questions" array — but always propose a title.
${groundingNote ? `\nReal-world context on a game this concept appears to name (from a web search — use it to ask sharper, genre-accurate questions; do not quote it back to the creator verbatim):\n${groundingNote}\n` : ''}${params.title ? `\nThe creator's working title, to improve on or keep: "${params.title}"\n` : ''}
Game Concept:
"""
${params.concept}
"""`;

      const parsed = await this.getClient()(promptText)
        .temperature(0.2)
        .thinking({ level: 'low' })
        .signal(AbortSignal.timeout(this.timeoutMs))
        .json((value) => RefineResultSchema.parse(value));

      const suggestedTitle = cleanSuggestedTitle(parsed.suggestedTitle);

      return {
        ...(suggestedTitle ? { suggestedTitle } : {}),
        questions: (parsed.questions ?? []).slice(0, 4).map((q, idx) => ({
          id: q.id ?? `q_${idx}`,
          question: q.question ?? '',
          options: q.options?.map((o) => ({ label: o.label, detail: o.detail })) ?? [],
          allowFreeText: q.allowFreeText !== false,
          // Opposite default to allowFreeText: single choice unless the model says so,
          // because presenting a single-choice question as multi-choice invites answers
          // that contradict each other.
          multiple: q.multiple === true,
        })),
      };
    } catch (err) {
      // Fail-closed: an error must not look like a clean, already-specified concept.
      if (process.env.NODE_ENV !== 'test') {
        // The budget is printed because an AbortError alone doesn't say what it
        // was measured against, and that budget is now env-tunable.
        console.warn(`Vertex AI spec refinement failed/timed out (budget ${this.timeoutMs}ms):`, err);
      }
      throw err;
    }
  }
}

export class StubSpecRefiner implements SpecRefiner {
  constructor(private mockResponse: RefineResponse = { questions: [] }) {}

  async refine(): Promise<RefineResponse> {
    return this.mockResponse;
  }
}

const RefineRequestSchema = z.object({
  // Optional since the naming step moved *after* this call: the app no longer has a
  // title to send, and the one it used to send was the prompt's first 40 characters.
  title: z
    .string()
    .trim()
    .min(3, 'title must be at least 3 characters')
    .max(MAX_TITLE_LENGTH, `title must be at most ${MAX_TITLE_LENGTH} characters`)
    .optional(),
  concept: z
    .string()
    .trim()
    .min(30, 'concept must be at least 30 characters')
    .max(4000, 'concept must be at most 4000 characters'),
  locale: z.string().trim().optional(),
});

export interface RefineRouteOptions {
  store?: Store;
  contentChecker: ContentChecker;
  specRefiner?: SpecRefiner;
  dailyRefineQuota?: number;
  botDailyRefineQuota?: number;
}

function refineQuotaFor(uid: string, humanQuota: number, botQuota: number): number {
  return uid.startsWith(BOT_UID_PREFIX) ? botQuota : humanQuota;
}

function isRateLimited(
  buckets: Map<string, number[]>,
  ip: string,
  currentTime: number,
  maxRequests: number,
  windowMs: number,
): boolean {
  const requests = (buckets.get(ip) ?? []).filter((timestamp) => currentTime - timestamp < windowMs);
  if (requests.length >= maxRequests) {
    buckets.set(ip, requests);
    return true;
  }

  requests.push(currentTime);
  buckets.set(ip, requests);
  return false;
}

export async function registerRefineRoute(app: FastifyInstance, options: RefineRouteOptions): Promise<void> {
  const store = options.store;
  const contentChecker = options.contentChecker;
  const specRefiner = options.specRefiner ?? new VertexSpecRefiner();
  const dailyRefineQuota = options.dailyRefineQuota ?? Number(process.env.DAILY_REFINE_QUOTA ?? '20');
  const botDailyRefineQuota = options.botDailyRefineQuota ?? Number(process.env.DAILY_REFINE_QUOTA_BOT ?? '200');

  const refinesByIp = new Map<string, number[]>();
  const rateLimitWindowMs = 60 * 60 * 1000;
  const maxRefinesPerWindowPerIp = 30;

  /**
   * Identical spec in, identical questions out — for free.
   *
   * The daily allowance is twenty, and it was possible to spend several of them on
   * one idea: dismiss the panel and resubmit, double-click the button, reload and
   * try again. None of those are the creator asking a new question, and each cost a
   * Vertex call and a slot they might want later that day. Keyed on the content, so
   * a genuinely edited concept still gets a fresh answer, and shared across users
   * because the questions depend on the spec alone.
   */
  const refineCache = new Map<string, { expiresAt: number; result: RefineResponse }>();

  const cacheKey = (data: { title?: string; concept: string; locale?: string }) =>
    createHash('sha256')
      .update(`${normalizeLocale(data.locale)}\x00${data.title ?? ''}\x00${data.concept}`)
      .digest('hex');

  const readCache = (key: string, now: number): RefineResponse | null => {
    const hit = refineCache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      refineCache.delete(key);
      return null;
    }
    return hit.result;
  };

  const writeCache = (key: string, result: RefineResponse, now: number) => {
    // A totally empty response is not worth pinning for ten minutes. A title with
    // no questions is a fully-specified concept, so that alone is still cached.
    if (result.questions.length === 0 && !result.suggestedTitle) return;
    if (refineCache.size >= REFINE_CACHE_MAX_ENTRIES) {
      const oldest = refineCache.keys().next().value;
      if (oldest !== undefined) refineCache.delete(oldest);
    }
    refineCache.set(key, { result, expiresAt: now + REFINE_CACHE_TTL_MS });
  };

  app.post('/api/submissions/refine', async (request: FastifyRequest, reply) => {
    if (!checkUserAccess(request, reply)) {
      return;
    }

    const parseResult = RefineRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues[0]?.message ?? 'invalid request' });
    }

    const currentTime = Date.now();
    if (isRateLimited(refinesByIp, request.ip, currentTime, maxRefinesPerWindowPerIp, rateLimitWindowMs)) {
      return reply.status(429).send({ error: 'too many refine requests, please try again later' });
    }

    // 1. A repeat of a spec already answered: no moderation call, no quota, no Vertex.
    // Safe to skip moderation because nothing reaches the cache without passing it —
    // the cached questions are the ones we ourselves produced for this exact text.
    const key = cacheKey(parseResult.data);
    const cached = readCache(key, currentTime);
    if (cached) {
      request.log.info({ questionCount: cached.questions.length, cached: true }, 'spec refine complete');
      return cached;
    }

    // 2. Content moderation (422 on reject, spends no quota / vertex calls)
    const moderatedFields = [parseResult.data.title, parseResult.data.concept].filter((field): field is string =>
      Boolean(field),
    );
    const moderation = await contentChecker.checkFields(moderatedFields);
    if (!moderation.allowed) {
      logModerationRejection(request.log, {
        surface: 'refine',
        uid: request.user?.uid,
        category: moderation.category,
      });
      return reply.status(422).send({ error: 'content_rejected', category: moderation.category ?? 'other' });
    }

    // 3. Daily refine quota check
    const dateStr = new Date(currentTime).toISOString().slice(0, 10);
    if (store) {
      const uid = request.user!.uid;
      const limit = refineQuotaFor(uid, dailyRefineQuota, botDailyRefineQuota);
      const quota = await store.checkAndIncrementQuota(uid, dateStr, limit, 'refines');
      if (!quota.allowed) {
        if (quota.tier === 'blocked') {
          return reply.status(403).send({ error: 'account is blocked' });
        }
        return reply.status(429).send({ error: 'daily refine quota exceeded' });
      }
    }

    // 4. Call spec refiner (fail-closed: an outage is reported as an error, not
    // disguised as a zero-question "already fully specified" success — see refine()).
    const startedAt = Date.now();
    try {
      const result = await specRefiner.refine({
        ...(parseResult.data.title ? { title: parseResult.data.title } : {}),
        concept: parseResult.data.concept,
        locale: normalizeLocale(parseResult.data.locale),
      });
      request.log.info(
        { questionCount: result.questions.length, durationMs: Date.now() - startedAt, cached: false },
        'spec refine complete',
      );
      writeCache(key, result, currentTime);
      return result;
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        request.log.warn({ err }, 'Spec refiner failed');
      }
      return reply.status(502).send({ error: 'refine_unavailable' });
    }
  });
}
