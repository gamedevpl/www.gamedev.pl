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
  it('answers null rather than echoing, so callers cannot mislabel the source language', async () => {
    expect(await new NoopTranslator().toBilingual()).toBeNull();
  });
});

describe('VertexTranslator.toBilingual', () => {
  it('asks for both languages in one call and returns them', async () => {
    let prompt = '';
    const translator = new VertexTranslator({
      client: genaicode(
        stubProvider('{"en":"Drawing the soldiers.","pl":"Rysuję żołnierzy."}', (r) => {
          prompt = JSON.stringify(r);
        }),
      ),
    });

    expect(await translator.toBilingual('Rysuję żołnierzy.', 'pl')).toEqual({
      en: 'Drawing the soldiers.',
      localized: 'Rysuję żołnierzy.',
    });
    // The whole point of the rewrite: the model is told not to assume the input is
    // English, so a Polish or German source normalizes rather than passing through
    // into a field every reader treats as the English fallback.
    expect(prompt).toContain('ANY language');
  });

  it('still calls for an English creator, because the source may not be English', async () => {
    // The one-directional version returned early on locale 'en'. That is exactly how a
    // German sentence ended up stored as the English fallback.
    let calls = 0;
    const translator = new VertexTranslator({
      client: genaicode(
        stubProvider('{"en":"Drawing the soldiers."}', () => {
          calls += 1;
        }),
      ),
    });

    expect(await translator.toBilingual('Zeichne die Soldaten.', 'en')).toEqual({
      en: 'Drawing the soldiers.',
      localized: 'Drawing the soldiers.',
    });
    expect(calls).toBe(1);
  });

  it('sends at temperature 0 with an abort signal and the prompt rules', async () => {
    let seen: GenerationRequest | undefined;
    const translator = new VertexTranslator({
      client: genaicode(
        stubProvider('{"en":"Added a player jump","pl":"Dodano skok gracza"}', (req) => {
          seen = req;
        }),
      ),
    });

    await translator.toBilingual('feat: add player jump', 'pl');
    expect(seen?.temperature).toBe(0);
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    // Concatenate parts so this stays valid if genaicode splits the prompt later.
    const promptText = (seen?.prompt ?? []).map((part) => part.text ?? '').join('');
    expect(promptText).toContain('Polish');
    expect(promptText).toContain('feat: add player jump');
    expect(promptText).toContain('JSON object');
  });

  it('gives a message its own prompt and its own cache entry', async () => {
    // A change request must not be compressed the way a commit subject is, and a string
    // rendered under one prompt is not a usable answer for the other.
    const prompts: string[] = [];
    const translator = new VertexTranslator({
      client: genaicode(
        stubProvider('{"en":"Make it bigger","pl":"Zrób to większe"}', (req) => {
          prompts.push((req.prompt ?? []).map((part) => part.text ?? '').join(''));
        }),
      ),
    });

    await translator.toBilingual('Make it bigger', 'pl', { kind: 'message' });
    await translator.toBilingual('Make it bigger', 'pl', { kind: 'log' });

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('Never summarize');
    expect(prompts[1]).toContain('one short line');
  });

  it('serves a repeat from cache without a second call', async () => {
    let calls = 0;
    const translator = new VertexTranslator({
      client: genaicode(
        stubProvider('{"en":"Drawing the soldiers.","pl":"Rysuję żołnierzy."}', () => {
          calls += 1;
        }),
      ),
    });

    await translator.toBilingual('Rysuję żołnierzy.', 'pl');
    await translator.toBilingual('Rysuję żołnierzy.', 'pl');
    expect(calls).toBe(1);
  });

  it('answers null when the model omits English, since that is the universal fallback', async () => {
    const translator = new VertexTranslator({
      client: genaicode(stubProvider('{"pl":"Rysuję żołnierzy."}')),
    });
    expect(await translator.toBilingual('Drawing the soldiers.', 'pl')).toBeNull();
  });

  it('answers null on a malformed response rather than throwing at the caller', async () => {
    const translator = new VertexTranslator({
      client: genaicode(stubProvider('not json at all')),
    });
    expect(await translator.toBilingual('Drawing the soldiers.', 'pl')).toBeNull();
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
