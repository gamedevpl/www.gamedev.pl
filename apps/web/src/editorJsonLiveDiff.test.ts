import { describe, expect, it } from 'vitest';
import { declaredParamDefaultChanges } from './editorJsonLiveDiff.js';

const BASE = JSON.stringify({
  content: { cards: [] },
  params: {
    speed: { type: 'number', label: { en: 'Speed', pl: 'Prędkość' }, min: 1, max: 10, default: 5 },
    hardMode: { type: 'boolean', label: { en: 'Hard mode', pl: 'Tryb trudny' }, default: false },
  },
});

describe('declaredParamDefaultChanges', () => {
  it('returns the changed param when only a default value moved', () => {
    const next = JSON.parse(BASE);
    next.params.speed.default = 8;
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(next))).toEqual([{ key: 'speed', value: 8 }]);
  });

  it('reports every param whose default moved, in one call', () => {
    const next = JSON.parse(BASE);
    next.params.speed.default = 8;
    next.params.hardMode.default = true;
    const changes = declaredParamDefaultChanges(BASE, JSON.stringify(next));
    expect(changes).not.toBeNull();
    expect(changes).toHaveLength(2);
    expect(changes).toEqual(
      expect.arrayContaining([
        { key: 'speed', value: 8 },
        { key: 'hardMode', value: true },
      ]),
    );
  });

  it('returns null when nothing actually changed', () => {
    expect(declaredParamDefaultChanges(BASE, BASE)).toBeNull();
  });

  it('returns null for a label change — a declaration edit, not a value tweak', () => {
    const next = JSON.parse(BASE);
    next.params.speed.label.en = 'Velocity';
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(next))).toBeNull();
  });

  it('returns null for a min/max/type change', () => {
    const next = JSON.parse(BASE);
    next.params.speed.max = 20;
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(next))).toBeNull();
  });

  it('returns null when a param is added or removed', () => {
    const added = JSON.parse(BASE);
    added.params.newOne = { type: 'number', label: { en: 'New', pl: 'Nowy' }, default: 1 };
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(added))).toBeNull();

    const removed = JSON.parse(BASE);
    delete removed.params.hardMode;
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(removed))).toBeNull();
  });

  it('returns null when a content collection changes alongside params', () => {
    const next = JSON.parse(BASE);
    next.params.speed.default = 8;
    next.content.cards = [{ properties: { cost: 1 } }];
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(next))).toBeNull();
  });

  it('returns null for invalid JSON on either side', () => {
    expect(declaredParamDefaultChanges(BASE, '{not json')).toBeNull();
    expect(declaredParamDefaultChanges('{not json', BASE)).toBeNull();
  });

  it('returns null when there are no params at all', () => {
    const noParams = JSON.stringify({ content: { cards: [] } });
    expect(declaredParamDefaultChanges(noParams, noParams)).toBeNull();
  });

  it('returns null for a new default that violates its own declared range', () => {
    const next = JSON.parse(BASE);
    next.params.speed.default = 999; // max is 10
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(next))).toBeNull();
  });

  it('returns null for a new default of the wrong type', () => {
    const next = JSON.parse(BASE);
    next.params.speed.default = 'fast';
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(next))).toBeNull();
  });

  it('returns null for a non-integer default on an int param', () => {
    const intBase = JSON.stringify({
      content: { cards: [] },
      params: { lives: { type: 'int', label: { en: 'Lives', pl: 'Życia' }, min: 1, max: 9, default: 3 } },
    });
    const next = JSON.parse(intBase);
    next.params.lives.default = 3.5;
    expect(declaredParamDefaultChanges(intBase, JSON.stringify(next))).toBeNull();
  });

  it('returns null for a text default longer than its declared max', () => {
    const textBase = JSON.stringify({
      content: { cards: [] },
      params: { title: { type: 'text', label: { en: 'Title', pl: 'Tytuł' }, max: 4, default: 'Ok' } },
    });
    const next = JSON.parse(textBase);
    next.params.title.default = 'way too long';
    expect(declaredParamDefaultChanges(textBase, JSON.stringify(next))).toBeNull();
  });

  it('returns null for an enum default outside its declared values', () => {
    const enumBase = JSON.stringify({
      content: { cards: [] },
      params: {
        mode: { type: 'enum', label: { en: 'Mode', pl: 'Tryb' }, values: ['easy', 'hard'], default: 'easy' },
      },
    });
    const next = JSON.parse(enumBase);
    next.params.mode.default = 'nightmare';
    expect(declaredParamDefaultChanges(enumBase, JSON.stringify(next))).toBeNull();
  });

  it('rejects the whole batch when one of several changed defaults is invalid', () => {
    const next = JSON.parse(BASE);
    next.params.speed.default = 8; // valid on its own
    next.params.hardMode.default = 'yes'; // not a boolean
    expect(declaredParamDefaultChanges(BASE, JSON.stringify(next))).toBeNull();
  });
});
