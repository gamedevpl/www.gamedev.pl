import { createHash } from 'node:crypto';
import type { GenAIClient } from 'genaicode';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { checkUserAccess } from './auth.js';
import { createVertexClient, type VertexGenerationConfig } from './genai.js';
import type { ContentChecker } from './moderation.js';
import type { Store } from './store.js';

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
}

export interface RefineParams {
  title: string;
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
  refinerFetcher?: (params: RefineParams) => Promise<RefineResponse>;
  // Lower-level seam than `refinerFetcher` — see VertexCheckerOptions.client.
  client?: GenAIClient;
}

// Moderation's 5s is right for a one-token verdict; refinement has to author up to
// four questions with labelled options *and* per-option detail text, in the
// creator's language. Prod logs (2026-07-24 21:56Z and 23:05Z) show both real
// attempts after the model fix aborting on the old 5s budget, so the panel has
// never rendered a question. Env-tunable so the ceiling can move without a deploy.
export const DEFAULT_REFINE_TIMEOUT_MS = 20_000;

/**
 * How long an answered spec stays free to re-ask, and how many are held. Short
 * enough that an edited concept is never served a stale answer for long; the cap
 * bounds memory on a single Cloud Run instance (4KB concepts, so ~1MB at worst).
 */
const REFINE_CACHE_TTL_MS = 10 * 60_000;
const REFINE_CACHE_MAX_ENTRIES = 200;

const RefineResultSchema = z.object({
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
  private refinerFetcher?: (params: RefineParams) => Promise<RefineResponse>;
  // Lazy for the same reason as VertexChecker: building one must not touch GCP.
  private client?: GenAIClient;

  constructor(options: VertexSpecRefinerOptions = {}) {
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? Number(process.env.REFINE_TIMEOUT_MS ?? DEFAULT_REFINE_TIMEOUT_MS);
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
        defaultModel: 'gemini-3.6-flash',
        // Thinking off: the prompt asks for a fixed JSON shape, not reasoning, and
        // the latency it adds is what pushed this call past its abort budget in
        // production. Moderation keeps its own config — this one is refine-only.
        generationConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        } as VertexGenerationConfig,
      });
    return this.client;
  }

  async refine(params: RefineParams): Promise<RefineResponse> {
    if (this.refinerFetcher) {
      return this.refinerFetcher(params);
    }

    try {
      const promptText = `You are a helpful game design assistant for gamedev.pl.
Analyze the following game title and concept specification.
Identify up to 4 underspecified or missing gameplay/design dimensions (such as visual style, controls, difficulty/pacing, or win/lose conditions) that would help a coding agent build a better game.

Language requirement: Formulate questions and options in the language specified (${params.locale ?? 'en'}).

Respond STRICTLY with a JSON object following this schema:
{
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

If the concept is already fully specified, return {"questions": []}.

Game Title: "${params.title}"
Game Concept:
"""
${params.concept}
"""`;

      const parsed = await this.getClient()(promptText)
        .temperature(0.2)
        .signal(AbortSignal.timeout(this.timeoutMs))
        .json((value) => RefineResultSchema.parse(value));

      return {
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
      // Fail-open per spec: timeout/error degrades silently to empty questions
      if (process.env.NODE_ENV !== 'test') {
        // The budget is printed because an AbortError alone doesn't say what it
        // was measured against, and that budget is now env-tunable.
        console.warn(`Vertex AI spec refinement failed/timed out (budget ${this.timeoutMs}ms), failing open:`, err);
      }
      return { questions: [] };
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
  title: z.string().trim().min(3, 'title must be at least 3 characters').max(80, 'title must be at most 80 characters'),
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

  const cacheKey = (data: { title: string; concept: string; locale?: string }) =>
    createHash('sha256')
      .update(`${data.locale ?? 'en'} ${data.title} ${data.concept}`)
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
    // Never cache a fail-open: an empty answer is exactly what a timeout produces,
    // and pinning that for ten minutes would turn one slow call into a dead panel.
    if (result.questions.length === 0) return;
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
    const moderation = await contentChecker.checkFields([parseResult.data.title, parseResult.data.concept]);
    if (!moderation.allowed) {
      return reply.status(422).send({ error: 'content_rejected', category: moderation.category ?? 'other' });
    }

    // 3. Daily refine quota check
    const dateStr = new Date(currentTime).toISOString().slice(0, 10);
    if (store) {
      const quota = await store.checkAndIncrementQuota(request.user!.uid, dateStr, dailyRefineQuota, 'refines');
      if (!quota.allowed) {
        if (quota.tier === 'blocked') {
          return reply.status(403).send({ error: 'account is blocked' });
        }
        return reply.status(429).send({ error: 'daily refine quota exceeded' });
      }
    }

    // 4. Call spec refiner (fail-open)
    const startedAt = Date.now();
    try {
      const result = await specRefiner.refine({
        title: parseResult.data.title,
        concept: parseResult.data.concept,
        locale: parseResult.data.locale,
      });
      // Fail-open makes an outage look exactly like a fully-specified concept: both
      // are zero questions and a 200. Without this line there is no way to tell them
      // apart in logs, which is how a dead model and then a too-short timeout each
      // survived unnoticed in production. A zero here with a refiner warning
      // alongside it is a failure; a zero on its own is a clean spec.
      request.log.info(
        { questionCount: result.questions.length, durationMs: Date.now() - startedAt, cached: false },
        'spec refine complete',
      );
      writeCache(key, result, currentTime);
      return result;
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        request.log.warn({ err }, 'Spec refiner failed, failing open with empty questions');
      }
      return { questions: [] };
    }
  });
}
