/** Persist remixed sources as a private Studio draft. */

import {
  EDITOR_CONTENT_FILE,
  EDITOR_FILE,
  GENERATED_CONTENT_PATH,
  generateEditorContentModule,
  parseEditorDefinition,
  validateEditorContent,
  type EditorContentDocument,
  type EditorDefinition,
} from './editor-contract.js';
import type { GamesStore, SourceFile, VersionManifest } from '../delivery/games-store.js';
import { InvalidUploadError } from '../platform/upload-error.js';
import { mintGameSlug } from '../platform/slug.js';
import { settleSlugClaim } from '../platform/slug-ownership.js';
import type { Store } from '../platform/store.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { mintToken } from '../platform/submission-token.js';
import { peekQuota } from './quota-gate.js';
import { CREATION_REFUSAL_CODES, type CreationGate } from './creation-limits.js';

export type RemixSaveParams = Record<string, string | number | boolean>;
export type RemixSaveContent = Record<string, unknown>;

export function collectEditorTextFields(
  definition: EditorDefinition | null,
  content?: Record<string, unknown>,
  params?: RemixSaveParams,
): string[] {
  if (!definition) return [];
  const fields: string[] = [];
  const values: Record<string, unknown> = {
    ...(content ?? {}),
    ...(params ? { params: { ...((content?.params as Record<string, unknown> | undefined) ?? {}), ...params } } : {}),
  };
  if (definition.params) {
    const paramValues = values.params;
    if (paramValues && typeof paramValues === 'object' && !Array.isArray(paramValues)) {
      for (const [name, spec] of Object.entries(definition.params)) {
        const value = (paramValues as Record<string, unknown>)[name];
        if (spec.type === 'text' && typeof value === 'string' && value.trim()) fields.push(value);
      }
    }
  }
  const addProperties = (spec: { properties: Record<string, { type: string }> }, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const properties = (value as { properties?: Record<string, unknown> }).properties;
    if (!properties) return;
    for (const [name, propertySpec] of Object.entries(spec.properties)) {
      const candidate = properties[name];
      if (propertySpec.type === 'text' && typeof candidate === 'string' && candidate.trim()) fields.push(candidate);
    }
  };
  for (const [key, spec] of Object.entries(definition.content)) {
    const items = values[key];
    if (Array.isArray(items)) for (const item of items) addProperties(spec.item, item);
  }
  if (definition.layers) {
    const layers = values.layers;
    if (layers && typeof layers === 'object' && !Array.isArray(layers)) {
      for (const [key, spec] of Object.entries(definition.layers)) {
        const value = (layers as Record<string, unknown>)[key];
        if (spec.widget === 'entities' && Array.isArray(value)) {
          for (const item of value) addProperties(spec, item);
        } else {
          addProperties(spec, value);
        }
      }
    }
  }
  return fields;
}

export type RemixSaveInput = {
  uid: string;
  ip: string;
  /** Parent game the remix was started from. */
  parentSlug: string;
  /** Published version / ref provenance when known. */
  parentVersion?: string;
  parentTitle: string;
  parentEngineRef?: string;
  /** Merged game sources (base + overrides) ready for putCandidateSources. */
  sources: Record<string, string>;
  /** Client-held param values to bake into EDITOR.json defaults. */
  params?: RemixSaveParams;
  /** Client-held painted collections to bake into EDITOR.json defaults. */
  content?: RemixSaveContent;
  /** Optional title for the new draft; defaults to a remix of the parent. */
  title?: string;
  /** Assembled HTML the player is looking at — becomes Studio preview.html. */
  html: string;
  definition: EditorDefinition | null;
  store: Store;
  gamesStore: GamesStore;
  creationGate?: CreationGate | null;
  submissionTokenSecret: string;
  dailySubmissionQuota?: number;
  now?: () => number;
  log: {
    error: (context: object, message: string) => void;
    info?: (context: object, message: string) => void;
  };
};

export type RemixSaveResult =
  | { ok: true; slug: string; jobId: number; token: string; version: string }
  | { ok: false; status: number; error: string; reason?: string; category?: string };

function defaultCollections(definition: EditorDefinition | null): Record<string, unknown> {
  if (!definition) return {};
  return Object.fromEntries(Object.entries(definition.content).map(([key, spec]) => [key, spec.defaults]));
}

/**
 * Whether the player has actually changed something worth keeping.
 *
 * Params and painted content live on the client; code overrides live on the
 * session. Either is enough — a code-only remix has nothing to share as a link
 * but is exactly what "make it mine" is for.
 */
export function remixHasSavableChange(input: {
  overrides: Record<string, string>;
  definition: EditorDefinition | null;
  params?: RemixSaveParams;
  content?: RemixSaveContent;
}): boolean {
  if (Object.keys(input.overrides).length > 0) return true;
  const specs = input.definition?.params;
  if (specs && input.params) {
    for (const [key, spec] of Object.entries(specs)) {
      if (input.params[key] !== undefined && input.params[key] !== spec.default) return true;
    }
  }
  if (input.definition && input.content) {
    for (const [key, spec] of Object.entries(input.definition.content)) {
      if (input.content[key] === undefined) continue;
      if (JSON.stringify(input.content[key]) !== JSON.stringify(spec.defaults)) return true;
    }
  }
  return false;
}

/**
 * Bake client params/content into EDITOR.json (+ regenerate editor-content.ts),
 * mirroring the Studio content-publish path so Check 31 stays satisfied.
 */
export function bakeRemixEditorDefaults(
  files: SourceFile[],
  definition: EditorDefinition | null,
  params?: RemixSaveParams,
  content?: RemixSaveContent,
): SourceFile[] {
  const editor = files.find((file) => file.path === EDITOR_FILE);
  if (!editor || !definition) return files;

  if (definition.version === 2) {
    const contentFile = files.find((file) => file.path === EDITOR_CONTENT_FILE);
    if (!contentFile) return files;
    let current: Record<string, unknown>;
    try {
      const parsed = JSON.parse(contentFile.content) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return files;
      current = parsed as Record<string, unknown>;
    } catch {
      return files;
    }

    const next: Record<string, unknown> = { ...current, ...(content ?? {}) };
    const currentParams =
      current.params && typeof current.params === 'object' && !Array.isArray(current.params)
        ? (current.params as Record<string, unknown>)
        : {};
    const nextParams = { ...currentParams, ...(params ?? {}) };
    if (definition.params) next.params = nextParams;
    if (validateEditorContent(definition, next).length > 0) return files;

    contentFile.content = `${JSON.stringify(next, null, 2)}\n`;
    const generatedContent = generateEditorContentModule(definition, next as EditorContentDocument);
    const generated = files.find((file) => file.path === GENERATED_CONTENT_PATH);
    if (generated) generated.content = generatedContent;
    else files.push({ path: GENERATED_CONTENT_PATH, content: generatedContent });
    return files;
  }

  const raw = JSON.parse(editor.content) as {
    params?: Record<string, { default?: unknown }>;
    content?: Record<string, { defaults?: unknown }>;
  };

  const collections = { ...defaultCollections(definition), ...(content ?? {}) };
  for (const [key, spec] of Object.entries(raw.content ?? {})) {
    if (collections[key] !== undefined) spec.defaults = collections[key];
  }

  const paramValues = {
    ...Object.fromEntries(Object.entries(definition.params ?? {}).map(([key, spec]) => [key, spec.default])),
    ...(params ?? {}),
  };
  if (raw.params) {
    for (const [key, spec] of Object.entries(raw.params)) {
      if (paramValues[key] !== undefined) spec.default = paramValues[key];
    }
  }

  editor.content = `${JSON.stringify(raw, null, 2)}\n`;

  const reparsed = parseEditorDefinition(editor.content);
  if (!reparsed.definition) return files;

  const generatedContent = generateEditorContentModule(reparsed.definition);
  const generated = files.find((file) => file.path === GENERATED_CONTENT_PATH);
  if (generated) generated.content = generatedContent;
  else files.push({ path: GENERATED_CONTENT_PATH, content: generatedContent });

  return files;
}

async function isSlugTaken(store: Store, slug: string, except?: number): Promise<boolean> {
  try {
    const existing = await store.getSubmissionBySlug(slug);
    if (existing && existing.jobId !== except) return true;
    if (await store.getPublication(slug)) return true;
  } catch {
    // Same forgiveness as createGame: an unavailable store must not block creation.
  }
  return false;
}

/**
 * Materialise a remixed game as a private Studio draft under a new slug.
 */
export async function saveRemixAsStudioDraft(input: RemixSaveInput): Promise<RemixSaveResult> {
  const now = input.now ?? Date.now;
  const dailyQuota = input.dailySubmissionQuota ?? 5;
  const dateStr = new Date(now()).toISOString().slice(0, 10);

  const wantedTitle = sanitizeCreatorText(input.title?.trim() || `Remix of ${input.parentTitle}`, {
    singleLine: true,
  });
  if (wantedTitle.length < 2) {
    return { ok: false, status: 400, error: 'give your version a name', reason: 'bad_title' };
  }

  const headroom = await peekQuota(input.store, input.uid, dateStr, dailyQuota, 'submissions');
  if (!headroom.allowed) {
    if (headroom.tier === 'blocked') return { ok: false, status: 403, error: 'account is blocked' };
    return { ok: false, status: 429, error: 'daily submission quota exceeded', reason: 'quota' };
  }

  if (input.creationGate) {
    const gate = await input.creationGate.checkAndSpend(input.uid, dateStr);
    if (!gate.allowed) {
      return { ok: false, status: 429, error: CREATION_REFUSAL_CODES[gate.reason], reason: gate.reason };
    }
  }

  const quota = await input.store.checkAndIncrementQuota(input.uid, dateStr, dailyQuota, 'submissions');
  if (!quota.allowed) {
    if (quota.tier === 'blocked') return { ok: false, status: 403, error: 'account is blocked' };
    return { ok: false, status: 429, error: 'daily submission quota exceeded', reason: 'quota' };
  }

  const files: SourceFile[] = Object.entries(input.sources).map(([path, content]) => ({ path, content }));
  bakeRemixEditorDefaults(files, input.definition, input.params, input.content);

  // Preview lane: no TRACE/PLAYTEST required. Still needs SPEC + playable entry.
  if (!files.some((file) => file.path === 'SPEC.md')) {
    return { ok: false, status: 409, error: 'this remix cannot be saved yet', reason: 'incomplete_sources' };
  }
  if (!files.some((file) => file.path === 'index.html') || !files.some((file) => file.path === 'game.ts')) {
    return { ok: false, status: 409, error: 'this remix cannot be saved yet', reason: 'incomplete_sources' };
  }

  const brief = [
    `Private remix of ${input.parentSlug}` + (input.parentVersion ? `@${input.parentVersion}` : '') + '.',
    'Saved from an in-player remix — sources copied as a draft, not rebuilt by an agent.',
    'Not a catalog publication; the creator may improve or share the draft from Studio.',
  ].join('\n');

  try {
    const wanted = await mintGameSlug(wantedTitle, (candidate) => isSlugTaken(input.store, candidate));
    const jobId = await input.store.allocateJobId();
    await input.store.createSubmission(jobId, input.uid, wantedTitle);
    await input.store.setSubmissionSlug(jobId, wanted);

    const slug = await settleSlugClaim(input.store, jobId, wanted, wantedTitle, (candidate, except) =>
      isSlugTaken(input.store, candidate, except),
    );
    if (!slug) {
      await input.store.setSubmissionAbandoned(jobId, new Date(now()).toISOString());
      input.log.error({ jobId, slug: wanted }, 'could not claim a slug for a remix save');
      return { ok: false, status: 409, error: 'name_unavailable', reason: 'name_unavailable' };
    }

    await input.store.setSubmissionBrief(jobId, { spec: brief, qa: [] });
    const at = () => new Date(now()).toISOString();
    await input.store.recordJobTransition(jobId, {
      to: 'queued',
      at: at(),
      by: 'creator',
      reason: 'remix_saved',
    });
    await input.store.recordJobTransition(jobId, {
      to: 'building',
      at: at(),
      by: 'creator',
      reason: 'remix_saved',
    });

    let version: string;
    let manifest: VersionManifest;
    try {
      ({ version, manifest } = await input.gamesStore.putCandidateSources({
        slug,
        jobId,
        files,
        requireCompiledEditor: true,
        backend: 'remix',
        origin: 'remix',
        mode: 'preview',
        ...(input.parentEngineRef ? { engineRef: input.parentEngineRef } : {}),
        forkedFrom: {
          slug: input.parentSlug,
          ...(input.parentVersion ? { version: input.parentVersion } : {}),
        },
      }));
    } catch (error) {
      await input.store
        .recordJobTransition(jobId, { to: 'failed', at: at(), by: 'creator', reason: 'delivery_failed' })
        .catch(() => {});
      if (error instanceof InvalidUploadError) {
        return { ok: false, status: 409, error: 'this remix cannot be saved yet', reason: 'invalid_sources' };
      }
      throw error;
    }

    await input.gamesStore.putDerivedArtifact(
      slug,
      version,
      'preview.html',
      Buffer.from(input.html, 'utf8'),
      'text/html; charset=utf-8',
    );

    await input.store.setSubmissionPreviewVersion(jobId, version);
    // shelf) without waiting on a gate that will never run for a preview fork.
    await input.store.setSubmissionDeliveredVersion(jobId, version);
    await input.store.recordJobTransition(jobId, {
      to: 'ready_for_review',
      at: at(),
      by: 'creator',
      reason: 'remix_saved',
    });

    const token = mintToken(jobId, input.submissionTokenSecret);
    input.log.info?.(
      {
        jobId,
        slug,
        parentSlug: input.parentSlug,
        parentVersion: input.parentVersion,
        version: manifest.version,
      },
      'remix saved as studio draft',
    );
    return { ok: true, slug, jobId, token, version };
  } catch (error) {
    input.log.error({ err: error, parentSlug: input.parentSlug }, 'failed to save remix as studio draft');
    return { ok: false, status: 502, error: 'could not save that just now', reason: 'error' };
  }
}
