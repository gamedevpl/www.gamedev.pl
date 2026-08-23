// Discovery Engine seam for knowledge_query. Fail-open: answer -> chunks -> warning result.

import { GoogleAuth } from 'google-auth-library';
import { rememberBounded } from './platform/bounded-map.js';

export type KnowledgeMode = 'answer' | 'chunks';
export type KnowledgeScope = 'kit' | 'editor' | 'examples' | 'docs';

export type KnowledgeWarningCode =
  | 'answer_empty_fallback'
  | 'upstream_error'
  | 'upstream_timeout'
  | 'malformed_response'
  | 'result_truncated'
  | 'not_configured'
  | 'rate_limited';

export interface KnowledgeQueryWarning {
  code: KnowledgeWarningCode;
  message: string;
}

export interface KnowledgeChunk {
  repoPath: string;
  corpus?: string;
  snippet: string;
}

export interface KnowledgeQueryResult {
  mode: KnowledgeMode;
  fallback: boolean; // true when an 'answer' request degraded to raw chunks
  answer?: string;
  chunks: KnowledgeChunk[];
  repoPaths: string[];
  indexedCommit?: string;
  guidance: string;
  truncated: boolean;
  cached: boolean;
  warnings: KnowledgeQueryWarning[];
}

export interface QueryKnowledgeOptions {
  query: string;
  mode?: KnowledgeMode;
  scope?: KnowledgeScope;
}

export type QueryKnowledgeFn = (options: QueryKnowledgeOptions) => Promise<KnowledgeQueryResult>;

export const DEFAULT_KNOWLEDGE_MODE: KnowledgeMode = 'answer';
export const DEFAULT_ANSWER_TIMEOUT_MS = 15_000;
export const DEFAULT_CHUNKS_TIMEOUT_MS = 10_000;
export const CHUNKS_PAGE_SIZE = 5;

// Target ~24 KiB; hard cap stays under the 50 KiB MCP ceiling.
export const DEFAULT_RESULT_TARGET_BYTES = 24 * 1024;
export const DEFAULT_RESULT_HARD_CAP_BYTES = 32 * 1024;

const DEFAULT_CACHE_MAX_ENTRIES = 200;

const API_VERIFICATION_GUIDANCE =
  'Prose here can drift from the pinned Creator Kit. Verify exact current API signatures ' +
  'via get_kit_api / read_kit_file on the pinned engineRef before trusting a signature ' +
  'from this response alone.';

// Discourages restating a wrong premise before correcting it — a measured failure mode.
const ANSWER_PREAMBLE =
  'If the question rests on an incorrect assumption about this platform, correct it ' +
  'directly rather than restating the assumption first. Cite sources for every claim.';

// :answer sometimes emits this instead of an error (~10% in one register).
const EMPTY_ANSWER_PATTERNS: readonly RegExp[] = [
  /cannot be answered (from|using) the (given|provided)?\s*(sources|context|search results)/i,
  /no answer could be generated/i,
  /not enough information (was found|is available)/i,
  /I\s*(could not|couldn't|cannot|can't)\s*find (an answer|any relevant information)/i,
];

// Native fetch + AbortSignal.timeout rejects TimeoutError; manual abort rejects AbortError.
function isAbortError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : undefined;
  return name === 'AbortError' || name === 'TimeoutError';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export function normalizeKnowledgeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Mapping is coordinated with the games-repo corpus's structData.corpus enum.
export function scopeToFilter(scope: KnowledgeScope | undefined): string | undefined {
  switch (scope) {
    case 'kit':
      return 'corpus: ANY("kit-api","module","vertical","digest")';
    case 'editor':
      return 'corpus: ANY("editor")';
    case 'examples':
      return 'corpus: ANY("example")';
    case 'docs':
      return 'corpus: ANY("doc","skill","spec")';
    default:
      return undefined;
  }
}

export function looksLikeEmptyAnswer(answerText: string, state?: string): boolean {
  if (state && state !== 'SUCCEEDED') return true;
  const trimmed = answerText.trim();
  if (!trimmed) return true;
  return EMPTY_ANSWER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

interface ExtractedSource {
  chunks: KnowledgeChunk[];
  repoPaths: string[];
  indexedCommit?: string;
}

function structDataOf(container: unknown): Record<string, unknown> {
  if (!isObject(container)) return {};
  const meta = isObject(container.documentMetadata)
    ? container.documentMetadata
    : isObject(container.derivedStructData)
      ? container.derivedStructData
      : undefined;
  if (meta && isObject(meta.structData)) return meta.structData;
  if (isObject(container.structData)) return container.structData;
  return {};
}

function repoPathOf(container: Record<string, unknown>, structData: Record<string, unknown>): string | undefined {
  const meta = isObject(container.documentMetadata) ? container.documentMetadata : {};
  return (
    asString(structData.repoPath) ??
    asString(meta.uri) ??
    asString(container.uri) ??
    asString(meta.title) ??
    asString(container.title)
  );
}

function sourceCommitOf(structData: Record<string, unknown>): string | undefined {
  return asString(structData.sourceCommit) ?? asString(structData.kitVersion);
}

// Dupe only if repoPath and snippet content both match exactly.
function dedupeChunkKey(repoPath: string, content: string): string {
  return JSON.stringify([repoPath, content]);
}

// Verified against the live Discovery Engine API — matches this shape exactly.
function extractChunksFromSearchResponse(json: unknown): ExtractedSource {
  const results = isObject(json) && Array.isArray(json.results) ? json.results : [];
  const chunks: KnowledgeChunk[] = [];
  const repoPaths = new Set<string>();
  const seen = new Set<string>();
  let indexedCommit: string | undefined;

  for (const raw of results) {
    if (!isObject(raw)) continue;
    const container = isObject(raw.chunk) ? raw.chunk : isObject(raw.document) ? raw.document : raw;
    const content = asString(container.content) ?? asString(container.snippet);
    if (!content) continue;
    const structData = structDataOf(container);
    const repoPath = repoPathOf(container, structData);
    const corpus = asString(structData.corpus);
    const sourceCommit = sourceCommitOf(structData);
    if (sourceCommit && !indexedCommit) indexedCommit = sourceCommit;
    if (repoPath) repoPaths.add(repoPath);
    const key = dedupeChunkKey(repoPath ?? 'unknown', content);
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.push({ repoPath: repoPath ?? 'unknown', ...(corpus ? { corpus } : {}), snippet: content });
  }

  return { chunks, repoPaths: [...repoPaths], indexedCommit };
}

// Verified against the live Discovery Engine API — matches this shape exactly.
function extractFromAnswerResponse(json: unknown): ExtractedSource & { answerText: string; state?: string } {
  const answerObj = isObject(json) && isObject(json.answer) ? json.answer : {};
  const answerText = asString(answerObj.answerText) ?? '';
  const state = asString(answerObj.state);
  const references = Array.isArray(answerObj.references) ? answerObj.references : [];

  const chunks: KnowledgeChunk[] = [];
  const repoPaths = new Set<string>();
  const seen = new Set<string>();
  let indexedCommit: string | undefined;

  for (const ref of references) {
    if (!isObject(ref)) continue;
    const container = isObject(ref.chunkInfo)
      ? ref.chunkInfo
      : isObject(ref.unstructuredDocumentInfo)
        ? ref.unstructuredDocumentInfo
        : ref;
    const content = asString(container.content) ?? asString(container.snippet);
    const structData = structDataOf(container);
    const repoPath = repoPathOf(container, structData);
    const sourceCommit = sourceCommitOf(structData);
    if (sourceCommit && !indexedCommit) indexedCommit = sourceCommit;
    if (repoPath) repoPaths.add(repoPath);
    if (!content) continue;
    // Answer synthesis cites one chunk per supported sentence, so refs repeat chunks.
    const key = dedupeChunkKey(repoPath ?? 'unknown', content);
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.push({ repoPath: repoPath ?? 'unknown', snippet: content });
  }

  return { answerText, state, chunks, repoPaths: [...repoPaths], indexedCommit };
}

function byteSizeOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

// Byte-safe cut — never splits a UTF-8 char mid-codepoint.
function truncateUtf8(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.byteLength <= maxBytes) return text;
  return buf.subarray(0, maxBytes).toString('utf8');
}

// Shrinks toward target, never silently exceeds the hard cap (invariant 4).
export function applyResultSizeBudget(
  result: KnowledgeQueryResult,
  targetBytes: number = DEFAULT_RESULT_TARGET_BYTES,
  hardCapBytes: number = DEFAULT_RESULT_HARD_CAP_BYTES,
): KnowledgeQueryResult {
  if (byteSizeOf(result) <= targetBytes) return result;

  let working: KnowledgeQueryResult = { ...result, chunks: [...result.chunks] };
  while (byteSizeOf(working) > hardCapBytes && working.chunks.length > 1) {
    working = { ...working, chunks: working.chunks.slice(0, -1) };
  }
  if (byteSizeOf(working) > hardCapBytes && working.answer) {
    working = { ...working, answer: truncateUtf8(working.answer, Math.floor(hardCapBytes * 0.6)) };
  }
  if (byteSizeOf(working) > hardCapBytes) {
    working = {
      ...working,
      chunks: working.chunks.map((chunk) => ({ ...chunk, snippet: truncateUtf8(chunk.snippet, 2000) })),
    };
  }
  // Last resort — keeps one huge chunk from ever exceeding the cap.
  if (byteSizeOf(working) > hardCapBytes) {
    working = {
      ...working,
      chunks: working.chunks.slice(0, 1).map((chunk) => ({ ...chunk, snippet: truncateUtf8(chunk.snippet, 500) })),
    };
  }

  return {
    ...working,
    truncated: true,
    warnings: [
      ...working.warnings,
      {
        code: 'result_truncated',
        message: `Response exceeded the ${targetBytes}-byte budget and was truncated. Narrow the query or scope for full content.`,
      },
    ],
  };
}

export interface CreateQueryKnowledgeOptions {
  engineId: string; // required: the Discovery Engine "engine" serving the data store
  projectId?: string;
  location?: string;
  collection?: string;
  servingConfig?: string;
  quotaProject?: string; // sent as X-Goog-User-Project — ADC alone 403s without it
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  now?: () => number;
  log?: (context: object, message: string) => void;
  answerTimeoutMs?: number;
  chunksTimeoutMs?: number;
  targetBytes?: number;
  hardCapBytes?: number;
  cacheMaxEntries?: number;
  cacheTtlMs?: number;
}

interface CacheEntry {
  result: KnowledgeQueryResult;
  indexedCommit?: string;
  cachedAt: number;
}

// Bounds staleness — noteIndexedCommit never runs on a cache hit.
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

function baseGuidanceResult(mode: KnowledgeMode): KnowledgeQueryResult {
  return {
    mode,
    fallback: false,
    chunks: [],
    repoPaths: [],
    guidance: API_VERIFICATION_GUIDANCE,
    truncated: false,
    cached: false,
    warnings: [],
  };
}

// Stateful (auth client, cache) — build once at startup, like gcs-sign.ts.
export function createQueryKnowledge(options: CreateQueryKnowledgeOptions): QueryKnowledgeFn {
  const location = options.location ?? 'eu';
  const collection = options.collection ?? 'default_collection';
  const servingConfig = options.servingConfig ?? 'default_search';
  const quotaProject = options.quotaProject ?? 'gamedevpl';
  const fetchImpl = options.fetchImpl ?? fetch;
  const answerTimeoutMs = options.answerTimeoutMs ?? DEFAULT_ANSWER_TIMEOUT_MS;
  const chunksTimeoutMs = options.chunksTimeoutMs ?? DEFAULT_CHUNKS_TIMEOUT_MS;
  const targetBytes = options.targetBytes ?? DEFAULT_RESULT_TARGET_BYTES;
  const hardCapBytes = options.hardCapBytes ?? DEFAULT_RESULT_HARD_CAP_BYTES;
  const cacheMaxEntries = options.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const projectId = options.projectId ?? 'gamedevpl';

  let auth: GoogleAuth | null = null;
  const getAuth = () => (auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }));
  const getAccessToken =
    options.getAccessToken ??
    (async () => {
      const token = await getAuth().getAccessToken();
      if (!token) throw new Error('could not obtain a Google access token for Discovery Engine');
      return token;
    });

  const host = `${location}-discoveryengine.googleapis.com`;
  const parent = `projects/${projectId}/locations/${location}/collections/${collection}/engines/${options.engineId}`;

  // Keyed on (mode, scope, query); flushed on a new commit or TTL.
  const cache = new Map<string, CacheEntry>();
  let lastIndexedCommit: string | undefined;

  function cacheKey(input: { mode: KnowledgeMode; scope?: KnowledgeScope; query: string }): string {
    return `${input.mode}:${input.scope ?? 'all'}:${normalizeKnowledgeQuery(input.query)}`;
  }

  function noteIndexedCommit(commit: string | undefined): void {
    if (!commit) return;
    if (lastIndexedCommit && lastIndexedCommit !== commit) cache.clear();
    lastIndexedCommit = commit;
  }

  async function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const token = await getAccessToken();
    const response = await fetchImpl(`https://${host}/v1/${parent}/servingConfigs/${servingConfig}:${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-goog-user-project': quotaProject,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Discovery Engine ${path} returned non-JSON (status ${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`Discovery Engine ${path} failed: ${response.status} ${text.slice(0, 200)}`);
    }
    return parsed;
  }

  async function runChunks(query: string, scope: KnowledgeScope | undefined): Promise<KnowledgeQueryResult> {
    const filter = scopeToFilter(scope);
    const json = await post(
      'search',
      {
        query,
        pageSize: CHUNKS_PAGE_SIZE,
        contentSearchSpec: { searchResultMode: 'CHUNKS' },
        ...(filter ? { filter } : {}),
      },
      chunksTimeoutMs,
    );
    const extracted = extractChunksFromSearchResponse(json);
    noteIndexedCommit(extracted.indexedCommit);
    return {
      ...baseGuidanceResult('chunks'),
      chunks: extracted.chunks,
      repoPaths: extracted.repoPaths,
      ...(extracted.indexedCommit ? { indexedCommit: extracted.indexedCommit } : {}),
    };
  }

  async function runAnswer(query: string, scope: KnowledgeScope | undefined): Promise<KnowledgeQueryResult> {
    const filter = scopeToFilter(scope);
    const json = await post(
      'answer',
      {
        query: { text: query },
        relatedQuestionsSpec: { enable: false },
        answerGenerationSpec: {
          ignoreAdversarialQuery: true,
          includeCitations: true,
          promptSpec: { preamble: ANSWER_PREAMBLE },
        },
        ...(filter
          ? { searchSpec: { searchParams: { filter, maxReturnResults: CHUNKS_PAGE_SIZE } } }
          : { searchSpec: { searchParams: { maxReturnResults: CHUNKS_PAGE_SIZE } } }),
      },
      answerTimeoutMs,
    );
    const extracted = extractFromAnswerResponse(json);
    if (looksLikeEmptyAnswer(extracted.answerText, extracted.state)) {
      throw new EmptyAnswerError();
    }
    noteIndexedCommit(extracted.indexedCommit);
    return {
      ...baseGuidanceResult('answer'),
      answer: extracted.answerText,
      chunks: extracted.chunks,
      repoPaths: extracted.repoPaths,
      ...(extracted.indexedCommit ? { indexedCommit: extracted.indexedCommit } : {}),
    };
  }

  return async function queryKnowledge(input: QueryKnowledgeOptions): Promise<KnowledgeQueryResult> {
    const mode = input.mode ?? DEFAULT_KNOWLEDGE_MODE;
    const query = input.query.trim();
    const key = cacheKey({ mode, scope: input.scope, query });
    const cached = cache.get(key);
    if (cached) {
      if (now() - cached.cachedAt < cacheTtlMs) {
        return { ...cached.result, cached: true };
      }
      cache.delete(key); // expired — fall through and refetch rather than serve stale
    }

    let result: KnowledgeQueryResult;
    // A fully degraded result (both tiers failed) is not cached.
    let cacheable = true;
    try {
      result = mode === 'answer' ? await runAnswer(query, input.scope) : await runChunks(query, input.scope);
    } catch (error) {
      if (mode === 'chunks') {
        result = degradedResult('chunks', error, options.log);
        cacheable = false;
      } else {
        const fallbackWarning: KnowledgeQueryWarning =
          error instanceof EmptyAnswerError
            ? {
                code: 'answer_empty_fallback',
                message: 'The answer service returned no usable answer; showing raw chunks instead.',
              }
            : upstreamWarningFor(error);
        try {
          const chunksResult = await runChunks(query, input.scope);
          result = { ...chunksResult, fallback: true, warnings: [fallbackWarning, ...chunksResult.warnings] };
        } catch (chunksError) {
          result = degradedResult('answer', chunksError, options.log, [fallbackWarning]);
          cacheable = false;
        }
      }
    }

    result = applyResultSizeBudget(result, targetBytes, hardCapBytes);
    if (cacheable) {
      rememberBounded(cache, key, { result, indexedCommit: result.indexedCommit, cachedAt: now() }, cacheMaxEntries);
    }
    return result;
  };
}

class EmptyAnswerError extends Error {
  constructor() {
    super('knowledge answer was empty or unsuccessful');
  }
}

function upstreamWarningFor(error: unknown): KnowledgeQueryWarning {
  if (isAbortError(error)) {
    return { code: 'upstream_timeout', message: 'Discovery Engine did not respond in time.' };
  }
  return { code: 'upstream_error', message: 'Discovery Engine request failed.' };
}

// Fail-open floor — every throw above lands here, never past queryKnowledge.
function degradedResult(
  mode: KnowledgeMode,
  error: unknown,
  log: ((context: object, message: string) => void) | undefined,
  extraWarnings: KnowledgeQueryWarning[] = [],
): KnowledgeQueryResult {
  log?.({ err: error, mode }, 'knowledge_query degraded to a warning-only result');
  const warning = error instanceof EmptyAnswerError ? undefined : upstreamWarningFor(error);
  return {
    ...baseGuidanceResult(mode),
    fallback: mode === 'answer',
    warnings: [...extraWarnings, ...(warning ? [warning] : [])],
  };
}

interface EnvLogger {
  info: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
}

// Off unless KNOWLEDGE_SEARCH_ENGINE_ID is set — normal for local dev / pre-corpus deploys.
export function createQueryKnowledgeFromEnv(log?: EnvLogger): QueryKnowledgeFn | undefined {
  const engineId = process.env.KNOWLEDGE_SEARCH_ENGINE_ID?.trim();
  if (!engineId) return undefined;
  log?.info({ engineId }, 'knowledge_query Discovery Engine client enabled');
  return createQueryKnowledge({
    engineId,
    projectId: process.env.KNOWLEDGE_SEARCH_PROJECT_ID?.trim() || undefined,
    location: process.env.KNOWLEDGE_SEARCH_LOCATION?.trim() || undefined,
    collection: process.env.KNOWLEDGE_SEARCH_COLLECTION?.trim() || undefined,
    servingConfig: process.env.KNOWLEDGE_SEARCH_SERVING_CONFIG?.trim() || undefined,
    quotaProject: process.env.KNOWLEDGE_SEARCH_QUOTA_PROJECT?.trim() || undefined,
    log: log ? (context, message) => log.warn(context, message) : undefined,
  });
}
