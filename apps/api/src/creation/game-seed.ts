// A bounded first draft; failures dispatch the build unseeded.
import { z } from 'zod';
import { SeedBudget, SEED_CONTEXT_TIMEOUT_MS, SEED_TOTAL_TIMEOUT_MS, SEED_TOTAL_OUTPUT_TOKENS } from './seed-budget.js';
import { buildGeneratePrompt } from './seed-generate-prompt.js';
import { usageOf, sumSeedUsage } from './seed-usage.js';
export { buildGeneratePrompt } from './seed-generate-prompt.js';
import type { GenAIClient, GenerationResult } from 'genaicode';
import { createSeedClient, type SeedProviderConfig } from './seed-provider.js';
import { checkSeedBundles, type SeedBundleResult } from './seed-bundle.js';
import { streamCollect, SEED_FENCE_HEADER_RE } from './seed-stream.js';
import { SEED_SCAFFOLD_SLUG, type SeedContext, type SeedContextSource } from './seed-context.js';
import { typeCheckGame } from './type-check.js';
import type { TypeCheckResult } from './type-check.js';
import { TYPECHECK_PREFLIGHT_BUDGET_MS } from './typecheck-preflight.js';
import type { QueryKnowledgeFn } from './knowledge-search.js';
import { isAllowedSeedPath, normalizeSeedPath } from './seed-paths.js';
import { GAME_KIT_MODULES } from '../platform/games-repo-contract.js';

export { isAllowedSeedPath, normalizeSeedPath } from './seed-paths.js';

const NOTES_FENCE = 'NOTES';

export const DEFAULT_SEED_REFERENCES = 1;

const CONTEXT_BYTE_BUDGET = 20_000;

// Chunks mode crowds out the reference budget rather than expanding the total.
const KNOWLEDGE_CONTEXT_BUDGET_FRACTION = 0.18;
const KNOWLEDGE_CONTEXT_BYTE_BUDGET = Math.floor(CONTEXT_BYTE_BUDGET * KNOWLEDGE_CONTEXT_BUDGET_FRACTION);

// Bounds how long knowledge context is worth waiting for.
const DEFAULT_SEED_KNOWLEDGE_TIMEOUT_MS = 8_000;

const MAX_SEED_FILE_BYTES = 120_000;

const MAX_SEED_TOTAL_BYTES = 400_000;

export const DEFAULT_SEED_PICK_TIMEOUT_MS = 30_000;
// Generation and repair share the outer deadline.
export const DEFAULT_SEED_GENERATE_TIMEOUT_MS = SEED_TOTAL_TIMEOUT_MS;

// 'low' thinking shares this budget; 512 could starve the JSON answer empty.
const SEED_PICK_MAX_OUTPUT_TOKENS = 2048;
// Provider ceilings can narrow the shared output allowance.
const GENERATE_MAX_OUTPUT_TOKENS = SEED_TOTAL_OUTPUT_TOKENS;
export const DEFAULT_SEED_TYPECHECK_TIMEOUT_MS = TYPECHECK_PREFLIGHT_BUDGET_MS;

// Provider that answers when a request names none, or an unregistered one.
export const DEFAULT_SEED_PROVIDER = 'vertex';

const MAX_SPEC_CHARS = 8000;
// Longer than this is a rewritten spec, not a correction.
const MAX_STEER_CHARS = 600;

export interface SeedFile {
  path: string;
  content: string;
}

export interface SeedUsage {
  inputTokens: number;
  outputTokens: number;
  // Cache reads are included in inputTokens, never additional tokens.
  cachedInputTokens?: number;
  model: string;
  // Which vendor answered. Absent on records written before this existed.
  provider?: string;
}

export interface SeedDraft {
  slug: string;
  files: SeedFile[];
  references: string[];
  notes?: string;
  usage: SeedUsage;
  elapsedMs: number;
  compiles: boolean;
  repaired: boolean;
  typeChecked: boolean;
  typeErrors: number;
}

export interface SeedRequest {
  slug: string;
  title: string;
  spec: string;
  // What the last draft got wrong. Data, never instructions.
  steer?: string;
  // Which provider answers. Resolved once per dispatch, never per-file or per-retry.
  provider?: string;
}

export interface GameSeeder {
  seed(request: SeedRequest): Promise<SeedDraft | null>;
}

const PickSchema = z.object({ picks: z.array(z.string()).optional() });

export interface ParsedSeedResponse {
  files: { path: string; content: string }[];
  notes?: string;
}

export function parseSeedResponse(text: string): ParsedSeedResponse {
  const unwrapped = text.replace(/^\s*```[a-z]*\r?\n/i, '').replace(/\r?\n```\s*$/, '');
  // Anchored to line starts with a trailing newline, so SPEC.md's own `---` frontmatter
  // delimiters (no label, no trailing content on the line) can never look like a fence.
  //
  // And the label must look like a path we would accept, or `NOTES`. Matching any
  // `--- anything ---` line was a real defect: a game with `--- GAME OVER ---` inside a
  // template literal — which is an entirely ordinary thing for a game to contain — had
  // its file truncated at that line and the remainder thrown away as an unwritable path.
  // A space in the label is now enough to disqualify it.
  const headers = [...unwrapped.matchAll(SEED_FENCE_HEADER_RE)];
  const files: { path: string; content: string }[] = [];
  let notes: string | undefined;

  for (let index = 0; index < headers.length; index++) {
    const header = headers[index];
    const start = header.index! + header[0].length;
    const end = index + 1 < headers.length ? headers[index + 1].index! : unwrapped.length;
    const label = header[1].trim();
    const body = unwrapped.slice(start, end);
    if (label === NOTES_FENCE) {
      notes = body.trim();
    } else {
      // Trailing blank lines are the fence separator, not content; every file ends in
      // exactly one newline, which is what the repo's own files look like.
      files.push({ path: label, content: `${body.replace(/\s+$/, '')}\n` });
    }
  }

  return { files, ...(notes ? { notes } : {}) };
}

export function collectSeedFiles(parsed: ParsedSeedResponse, slug: string): SeedFile[] {
  const files: SeedFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const file of parsed.files) {
    const normalized = normalizeSeedPath(file.path, slug);
    if (!isAllowedSeedPath(normalized)) continue;
    // A model that emits the same path twice is confused about its own draft; taking the
    // first keeps the result deterministic rather than order-dependent.
    if (seen.has(normalized)) continue;
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_SEED_FILE_BYTES || totalBytes + bytes > MAX_SEED_TOTAL_BYTES) continue;
    seen.add(normalized);
    totalBytes += bytes;
    files.push({ path: normalized, content: file.content });
  }

  return files;
}

export function isUsableSeed(files: SeedFile[]): boolean {
  const paths = new Set(files.map((file) => file.path));
  const hasModule = files.some((file) => file.path.startsWith('game/') && file.path.endsWith('.ts'));
  const hasEditor = paths.has('EDITOR.json');
  return paths.has('game.ts') && paths.has('SPEC.md') && hasModule && hasEditor;
}

export function seedManifestError(files: SeedFile[]): string | null {
  const content = files.find((file) => file.path === 'GAME.json')?.content;
  if (!content) return null;
  let modules: unknown;
  try {
    modules = (JSON.parse(content) as { engine?: { modules?: unknown } }).engine?.modules;
  } catch {
    return 'GAME.json: invalid JSON';
  }
  if (!Array.isArray(modules) || !modules.every((name) => typeof name === 'string')) {
    return 'GAME.json: engine.modules must be an array of GameKit module names';
  }
  const unknown = modules.filter((name) => !(GAME_KIT_MODULES as readonly string[]).includes(name));
  if (unknown.length) return `GAME.json: unknown engine modules ${JSON.stringify(unknown)}`;
  const canonical = GAME_KIT_MODULES.filter((name) => modules.includes(name));
  if (canonical.length !== modules.length || canonical.join(',') !== modules.join(',')) {
    return `GAME.json: engine.modules must be unique and in canonical order ${JSON.stringify(canonical)}`;
  }
  return null;
}

export function buildPickPrompt(context: SeedContext, spec: string, references: number): string {
  return [
    'You match a game request to reference implementations.',
    'Below is a catalog of finished browser games (slug — title — genre), then a creator request.',
    `Pick the ${references} games whose SOURCE CODE would be the most useful references for building`,
    'the request: closest genre and core mechanic first, then similar controls and perspective.',
    'Prefer variety over near-duplicates.',
    'Reply as JSON: {"picks": ["slug", ...]} using only slugs from the catalog.',
    '',
    '=== CATALOG ===',
    context.catalogIndex,
    '',
    '=== CREATOR REQUEST ===',
    spec,
  ].join('\n');
}

// Renders knowledge-search chunks as labelled excerpts, cut to a byte budget.
export function renderKnowledgeContext(
  chunks: ReadonlyArray<{ repoPath: string; snippet: string }>,
  byteBudget: number,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const block = `--- ${chunk.repoPath} ---\n${chunk.snippet.trim()}\n`;
    const bytes = Buffer.byteLength(block, 'utf8');
    if (used + bytes > byteBudget) break;
    parts.push(block);
    used += bytes;
  }
  return parts.join('\n');
}

export function buildRepairPrompt(input: { slug: string; errors: string[]; files: SeedFile[] }): string {
  return [
    'The game draft below fails validation. Fix it.',
    '',
    'Validation errors:',
    ...input.errors.map((error) => `- ${error}`),
    '',
    'Rules:',
    '- Return ONLY the files that need to change, each complete — never a fragment or a diff.',
    '- Files you do not return are kept exactly as they are.',
    `- Same paths as below (games/${input.slug}/...), same fence format, no commentary.`,
    '- Fix the errors with the smallest change that is actually correct; do not redesign the game.',
    '',
    '=== CURRENT DRAFT ===',
    ...input.files.map((file) => `--- games/${input.slug}/${file.path} ---\n${file.content}`),
  ].join('\n');
}

function positiveNumber(value: string | number | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface ModelGameSeederOptions {
  context: SeedContextSource;
  // Every provider this seeder may call, resolved once at boot per vendor.
  providers?: Map<string, SeedProviderConfig>;
  // Answers a request naming no provider, or an unconfigured one.
  defaultProvider?: string;
  references?: number;
  pickTimeoutMs?: number;
  generateTimeoutMs?: number;
  typeCheckTimeoutMs?: number;
  log?: { warn: (context: object, message: string) => void; info: (context: object, message: string) => void };
  // Test seam: a prebuilt client, wins over `providers` entirely.
  client?: GenAIClient;
  // knowledge-search.ts, called server-internally (chunks mode).
  knowledgeSearch?: QueryKnowledgeFn;
  knowledgeTimeoutMs?: number;
  typeCheck?: (sources: Record<string, string>, kitDeclaration: string | null) => TypeCheckResult;
  bundleCheck?: (slug: string, files: SeedFile[]) => Promise<SeedBundleResult>;
}

// The production seeder: three bounded model calls, all failures swallowed.
export class ModelGameSeeder implements GameSeeder {
  private readonly references: number;
  private readonly pickTimeoutMs: number;
  private readonly generateTimeoutMs: number;
  private readonly typeCheckTimeoutMs: number;
  private readonly defaultProvider: string;
  private readonly providers: Map<string, SeedProviderConfig>;
  private readonly clients = new Map<string, GenAIClient>();

  constructor(private readonly options: ModelGameSeederOptions) {
    this.providers = options.providers ?? new Map();
    this.references = positiveNumber(options.references ?? process.env.SEED_REFERENCES, DEFAULT_SEED_REFERENCES);
    this.pickTimeoutMs = positiveNumber(
      options.pickTimeoutMs ?? process.env.SEED_PICK_TIMEOUT_MS,
      DEFAULT_SEED_PICK_TIMEOUT_MS,
    );
    this.generateTimeoutMs = positiveNumber(
      options.generateTimeoutMs ?? process.env.SEED_GENERATE_TIMEOUT_MS,
      DEFAULT_SEED_GENERATE_TIMEOUT_MS,
    );
    this.typeCheckTimeoutMs = positiveNumber(
      options.typeCheckTimeoutMs ?? process.env.SEED_TYPECHECK_TIMEOUT_MS,
      DEFAULT_SEED_TYPECHECK_TIMEOUT_MS,
    );
    this.defaultProvider = options.defaultProvider ?? DEFAULT_SEED_PROVIDER;
  }

  // An unconfigured requested id falls back to the default rather than failing.
  private resolveProvider(requested: string | undefined): string {
    if (this.options.client) return requested ?? this.defaultProvider; // test seam: id is a label only
    if (requested && this.providers.has(requested)) return requested;
    if (requested) {
      this.options.log?.warn({ requested, fallback: this.defaultProvider }, 'seed provider not configured');
    }
    return this.defaultProvider;
  }

  private modelFor(providerId: string): string {
    return this.providers.get(providerId)?.model ?? providerId;
  }

  // A provider may narrow the shared output allowance.
  private maxOutputTokensFor(providerId: string): number {
    return this.providers.get(providerId)?.maxOutputTokens ?? GENERATE_MAX_OUTPUT_TOKENS;
  }

  // A vendor that always reasons (Muse Spark: no opt-out) can spend the whole default
  // budget on hidden reasoning before writing a single pick — raise it per provider.
  // Still never above what the vendor accepts at all.
  private pickMaxOutputTokensFor(providerId: string): number {
    const base = this.providers.get(providerId)?.pickMaxOutputTokens ?? SEED_PICK_MAX_OUTPUT_TOKENS;
    return Math.min(base, this.maxOutputTokensFor(providerId));
  }

  // Lazy: constructing a client must not touch the network.
  private client(providerId: string): GenAIClient {
    if (this.options.client) return this.options.client;
    const cached = this.clients.get(providerId);
    if (cached) return cached;
    const config = this.providers.get(providerId);
    if (!config) throw new Error(`seed provider "${providerId}" is not configured`);
    const built = createSeedClient(providerId, config);
    this.clients.set(providerId, built);
    return built;
  }

  // Constrains the pick shape, portable across providers; doesn't reserve output tokens.
  private pickResponseFormat(): { type: 'json_schema'; name: string; schema: Record<string, unknown> } {
    return {
      type: 'json_schema',
      name: 'seed_picks',
      schema: {
        type: 'object',
        properties: { picks: { type: 'array', items: { type: 'string' }, maxItems: this.references } },
        required: ['picks'],
      },
    };
  }

  private async pickReferences(
    context: SeedContext,
    spec: string,
    providerId: string,
    budget: SeedBudget,
  ): Promise<{ picks: string[]; usage: SeedUsage }> {
    // Raw thinkingBudget:0 also 400s on gemini-3.8-flash; 'low' is the floor.
    // Reasoning-locked models reject temperature overrides; schema constraints suffice.
    const prompt = buildPickPrompt(context, spec, this.references);
    const result = await budget.call(
      'pick',
      prompt,
      this.pickMaxOutputTokensFor(providerId),
      this.pickTimeoutMs,
      (signal, tokens) =>
        this.client(providerId)(prompt)
          .responseFormat(this.pickResponseFormat())
          .thinking({ level: 'low' })
          .maxOutputTokens(tokens)
          .signal(signal)
          .run(),
    );

    const usage = usageOf(result, providerId, this.modelFor(providerId));
    // An empty or malformed reply must fail open, not crash the seed.
    let picks: string[] = [];
    try {
      const parsed = PickSchema.safeParse(JSON.parse(extractJson(result)));
      picks = (parsed.success ? (parsed.data.picks ?? []) : [])
        .filter((slug) => context.hasGame(slug))
        .slice(0, this.references);
    } catch (error) {
      this.options.log?.warn(
        { err: error, raw: extractJson(result).slice(0, 200) },
        'seed pick response was not valid JSON, treating as no references',
      );
    }

    return { picks, usage };
  }

  // Fail-open: absent or timed out just means references-only generation.
  private async fetchKnowledgeContext(slug: string, spec: string): Promise<string | undefined> {
    if (!this.options.knowledgeSearch) return undefined;
    try {
      const timeoutMs = this.options.knowledgeTimeoutMs ?? DEFAULT_SEED_KNOWLEDGE_TIMEOUT_MS;
      const result = await Promise.race([
        this.options.knowledgeSearch({ query: spec.slice(0, 400), mode: 'chunks', scope: 'kit' }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('knowledge timeout')), timeoutMs)),
      ]);
      const rendered = renderKnowledgeContext(result.chunks, KNOWLEDGE_CONTEXT_BYTE_BUDGET);
      return rendered || undefined;
    } catch (error) {
      this.options.log?.warn({ err: error, slug }, 'seed knowledge context unavailable, using references only');
      return undefined;
    }
  }

  private typeCheck(files: SeedFile[], kitDeclaration: string | null): { verdict: TypeCheckResult; checked: boolean } {
    if (!kitDeclaration) return { verdict: { ok: true }, checked: false };

    const startedAt = Date.now();
    try {
      const verdict = (this.options.typeCheck ?? typeCheckGame)(
        Object.fromEntries(files.map((file) => [file.path, file.content])),
        kitDeclaration,
      );
      if (Date.now() - startedAt > this.typeCheckTimeoutMs) {
        return { verdict: { ok: true }, checked: false };
      }
      return { verdict, checked: true };
    } catch {
      return { verdict: { ok: true }, checked: false };
    }
  }

  private generate(prompt: string, providerId: string, slug: string, event: string, budget: SeedBudget) {
    return budget.call(event, prompt, this.maxOutputTokensFor(providerId), this.generateTimeoutMs, (signal, tokens) =>
      streamCollect(
        this.client(providerId)(prompt).thinking({ level: 'low' }).maxOutputTokens(tokens).signal(signal).stream(),
        (file) => this.options.log?.info({ slug, file }, event),
      ),
    );
  }

  async seed(request: SeedRequest): Promise<SeedDraft | null> {
    try {
      const providerId = this.resolveProvider(request.provider);
      const model = this.options.client ? 'gemini-3.8-flash' : this.modelFor(providerId);
      const budget = new SeedBudget(
        model,
        {
          info: (context, message) => this.options.log?.info({ ...context, slug: request.slug, model }, message),
        },
        SEED_TOTAL_TIMEOUT_MS,
        providerId,
      );
      return await budget.wait(this.seedWithinBudget(request, providerId, budget));
    } catch (error) {
      this.options.log?.warn({ err: error, slug: request.slug }, 'seed generation failed, dispatching unseeded');
      return null;
    }
  }

  private async seedWithinBudget(
    request: SeedRequest,
    providerId: string,
    budget: SeedBudget,
  ): Promise<SeedDraft | null> {
    const startedAt = Date.now();
    try {
      const context = await budget.wait(this.options.context.load(), SEED_CONTEXT_TIMEOUT_MS);
      if (!context) return null;

      const slug = request.slug;
      const spec = request.spec.slice(0, MAX_SPEC_CHARS);
      const steer = request.steer?.trim().slice(0, MAX_STEER_CHARS) || undefined;
      // The steer rides the picker, or wrong references return.
      const { picks, usage: pickUsage } = await this.pickReferences(
        context,
        steer ? `${spec}\n\n${steer}` : spec,
        providerId,
        budget,
      );
      // No references means no style guide and no API documentation in context; the draft
      // that would come back is a guess at an engine it has never seen.
      if (picks.length === 0) {
        this.options.log?.warn({ slug }, 'seed skipped: no reference games matched');
        return null;
      }

      const knowledgeContext = await budget.wait(this.fetchKnowledgeContext(slug, spec));
      const referenceBudget = knowledgeContext
        ? CONTEXT_BYTE_BUDGET - KNOWLEDGE_CONTEXT_BYTE_BUDGET
        : CONTEXT_BYTE_BUDGET;

      // Rendering it twice wastes budget and over-weights one game's mechanics.
      const duplicate = picks.includes(SEED_SCAFFOLD_SLUG);
      if (!context.scaffold) {
        this.options.log?.warn({ slug }, 'seed scaffold missing from the archive; prompting without one');
      }
      const generatePrompt = buildGeneratePrompt({
        slug,
        title: request.title,
        spec,
        scaffold: duplicate ? '' : context.scaffold,
        references: context.renderReferences(picks, referenceBudget),
        ...(knowledgeContext ? { knowledgeContext } : {}),
        ...(steer ? { steer } : {}),
      });
      const result = await this.generate(generatePrompt, providerId, slug, 'seed file generated', budget);

      const generateUsage = usageOf(result, providerId, this.modelFor(providerId));
      const parsed = parseSeedResponse(resultTextOf(result));
      let files = collectSeedFiles(parsed, slug);
      if (!isUsableSeed(files)) {
        this.options.log?.warn({ slug, files: files.length }, 'seed discarded: draft did not contain a usable game');
        return null;
      }

      let usage = sumSeedUsage(pickUsage, generateUsage);

      // One repair round when the draft does not bundle. The distinction funds the
      // round-0 preview: a bundling draft can be assembled and shown to the creator
      // within minutes, and roughly a third of first drafts miss by one fixable line.
      // One round, not a loop — a draft two rounds from compiling is better finished by
      // the agent, which was going to read it anyway.
      const bundleCheck = this.options.bundleCheck ?? checkSeedBundles;
      const checkDraft = async (candidate: SeedFile[]) => {
        const [bundleVerdict, typeCheckResult] = await Promise.all([
          bundleCheck(slug, candidate),
          Promise.resolve(this.typeCheck(candidate, context.kitDeclaration)),
        ]);
        return { bundleVerdict, typeCheckResult, manifestError: seedManifestError(candidate) };
      };

      let checks = await budget.wait(checkDraft(files));
      let repaired = false;
      const validationErrors = () => [
        ...(checks.bundleVerdict.ok ? [] : checks.bundleVerdict.errors),
        ...(checks.typeCheckResult.verdict.ok ? [] : checks.typeCheckResult.verdict.errors),
        ...(checks.manifestError ? [checks.manifestError] : []),
      ];

      if (validationErrors().length > 0) {
        repaired = true;
        const repairPrompt = buildRepairPrompt({ slug, errors: validationErrors(), files });
        const repairResult = await this.generate(repairPrompt, providerId, slug, 'seed repair file generated', budget);
        const repairUsage = usageOf(repairResult, providerId, this.modelFor(providerId));
        usage = sumSeedUsage(usage, repairUsage);

        // Merge whole corrected files over the draft; untouched files stay. The corrected
        // files pass the same guard as the originals — a repair is not a wider door.
        const corrections = collectSeedFiles(parseSeedResponse(resultTextOf(repairResult)), slug);
        if (corrections.length > 0) {
          const merged = new Map(files.map((file) => [file.path, file]));
          for (const correction of corrections) merged.set(correction.path, correction);
          const candidate = [...merged.values()];
          // A repair that broke the draft's shape is discarded wholesale — the original
          // still exists and is still a usable head start for the agent.
          if (isUsableSeed(candidate)) files = candidate;
        }
        checks = await budget.wait(checkDraft(files));
      }
      const typeErrors = checks.typeCheckResult.verdict.ok ? 0 : checks.typeCheckResult.verdict.errors.length;

      budget.assertAvailable();
      const draft: SeedDraft = {
        slug,
        files,
        references: picks,
        ...(parsed.notes ? { notes: parsed.notes } : {}),
        usage,
        elapsedMs: Date.now() - startedAt,
        compiles: checks.bundleVerdict.ok && !checks.manifestError,
        repaired,
        typeChecked: checks.typeCheckResult.checked,
        typeErrors,
      };
      this.options.log?.info(
        {
          slug,
          references: picks,
          files: files.length,
          ms: draft.elapsedMs,
          tokens: draft.usage,
          compiles: draft.compiles,
          repaired: draft.repaired,
          typeChecked: draft.typeChecked,
          typeErrors: draft.typeErrors,
        },
        'seed generated',
      );
      return draft;
    } catch (error) {
      // Every failure is the same failure from the caller's side: there is no seed, and
      // the build dispatches exactly as it would have before this module existed.
      this.options.log?.warn({ err: error, slug: request.slug }, 'seed generation failed, dispatching unseeded');
      return null;
    }
  }
}

function resultTextOf(result: GenerationResult): string {
  return result.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

function extractJson(result: GenerationResult): string {
  const text = resultTextOf(result);
  return text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}
