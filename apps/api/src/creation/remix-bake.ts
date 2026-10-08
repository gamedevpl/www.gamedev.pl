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
import type { SourceFile } from '../delivery/games-store.js';

// Bakes remix params/content into EDITOR.json for a proposal candidate.

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

// The declaration's collections at their defaults, or a valid stored document.
export function defaultCollections(definition: EditorDefinition | null, rawContent?: string): Record<string, unknown> {
  if (!definition) return {};
  if (rawContent) {
    try {
      const parsed: unknown = JSON.parse(rawContent);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const content = parsed as EditorContentDocument;
        if (validateEditorContent(definition, content).length === 0) return content;
      }
    } catch {
      // Malformed content falls back to the declaration defaults below.
    }
  }
  return Object.fromEntries(Object.entries(definition.content).map(([key, spec]) => [key, spec.defaults]));
}

// Code overrides, or params/paint that differ from the declaration defaults.
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

// Mirrors the Studio content-publish path so Check 31 stays satisfied.
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
