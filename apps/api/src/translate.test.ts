import { genaicode } from 'genaicode';
import type { GenerationRequest, ModelProvider } from 'genaicode';
import { afterEach, describe, expect, it } from 'vitest';
import { createTranslatorFromEnv, normalizeLocale, NoopTranslator, VertexTranslator } from './translate.js';

// Stub provider: exercises the real genaicode request/response path (prompt
// assembly, JSON parsing, schema validation) with no GCP calls.
function stubProvider(responseText: string, capture?: (request: GenerationRequest) => void): ModelProvider {
  return {
    name: 'stub',
    async generate(request) {
      capture?.(request);
      return { parts: [{ type: 'text', text: responseText }] };
    },
  };
}

describe('normalizeLocale', () => {
  it('keeps known base tags and strips region suffixes', () => {
    expect(normalizeLocale('pl')).toBe('pl');
    expect(normalizeLocale('pl-PL')).toBe('pl');
    expect(normalizeLocale('en_US')).toBe('en');
  });

  it('collapses unknown or empty tags to English', () => {
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale('')).toBe('en');
    expect(normalizeLocale('de')).toBe('en');
  });
});

describe('NoopTranslator', () => {
  it('returns the input texts unchanged', async () => {
    const translator = new NoopTranslator();
    const texts = ['feat: add player jump', 'Wire up collision'];
    expect(await translator.translate(texts, 'pl')).toEqual(texts);
  });
});

describe('VertexTranslator', () => {
  it('skips the model for English targets and empty batches', async () => {
    let calls = 0;
    const translator = new VertexTranslator({
      translateFetcher: async () => {
        calls += 1;
        return ['nie powinno'];
      },
    });

    expect(await translator.translate(['feat: add jump'], 'en')).toEqual(['feat: add jump']);
    expect(await translator.translate([], 'pl')).toEqual([]);
    expect(calls).toBe(0);
  });

  it('uses translateFetcher and serves a cache hit without refetching', async () => {
    let calls = 0;
    const translator = new VertexTranslator({
      translateFetcher: async (texts, locale) => {
        calls += 1;
        expect(locale).toBe('pl');
        expect(texts).toEqual(['feat: add player jump']);
        return ['Dodano skok gracza'];
      },
    });

    expect(await translator.translate(['feat: add player jump'], 'pl-PL')).toEqual(['Dodano skok gracza']);
    expect(await translator.translate(['feat: add player jump'], 'pl')).toEqual(['Dodano skok gracza']);
    expect(calls).toBe(1);
  });

  it('fails open when the fetcher throws', async () => {
    const translator = new VertexTranslator({
      translateFetcher: async () => {
        throw new Error('Vertex AI network timeout');
      },
    });

    expect(await translator.translate(['feat: add jump'], 'pl')).toEqual(['feat: add jump']);
  });
});

describe('VertexTranslator over a genaicode client', () => {
  it('sends the batch at temperature 0 with an abort signal and the prompt rules', async () => {
    let seen: GenerationRequest | undefined;
    const translator = new VertexTranslator({
      client: genaicode(
        stubProvider(JSON.stringify(['Dodano skok gracza']), (req) => {
          seen = req;
        }),
      ),
    });

    expect(await translator.translate(['feat: add player jump'], 'pl')).toEqual(['Dodano skok gracza']);
    expect(seen).toBeDefined();
    expect(seen?.temperature).toBe(0);
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    // Concatenate parts so this stays valid if genaicode splits the prompt later.
    const promptText = (seen?.prompt ?? []).map((part) => part.text ?? '').join('');
    expect(promptText).toContain('Polish');
    expect(promptText).toContain('feat: add player jump');
    expect(promptText).toContain('Return ONLY a JSON array of strings');
  });

  it('maps non-string JSON array entries to empty strings and keeps source text', async () => {
    const translator = new VertexTranslator({
      client: genaicode(stubProvider(JSON.stringify([42, null, 'ok']))),
    });

    // Non-string / empty mapped entries are not cached, so those sources stay as-is.
    expect(await translator.translate(['a', 'b', 'c'], 'pl')).toEqual(['a', 'b', 'ok']);
  });

  it('fails open on a malformed or non-array response', async () => {
    for (const body of ['not json at all', '', '{"nope": true}', '42']) {
      const translator = new VertexTranslator({ client: genaicode(stubProvider(body)) });
      expect(await translator.translate(['feat: add jump'], 'pl')).toEqual(['feat: add jump']);
    }
  });
});

describe('createTranslatorFromEnv', () => {
  const previous = process.env.TRANSLATE_BUILD_LOG;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.TRANSLATE_BUILD_LOG;
    } else {
      process.env.TRANSLATE_BUILD_LOG = previous;
    }
  });

  it('returns NoopTranslator when TRANSLATE_BUILD_LOG=false', () => {
    process.env.TRANSLATE_BUILD_LOG = 'false';
    expect(createTranslatorFromEnv()).toBeInstanceOf(NoopTranslator);
  });

  it('returns VertexTranslator by default', () => {
    delete process.env.TRANSLATE_BUILD_LOG;
    expect(createTranslatorFromEnv()).toBeInstanceOf(VertexTranslator);
  });
});
