import { expect, it } from 'vitest';
import { typecheckDeliverySources } from './typecheck-preflight.js';

it('checks historical simulation imports against a declaration-only Kit', () => {
  const input = {
    slug: 'compiled',
    kitShared: {
      'shared/game-kit.d.ts': 'declare const GameKit: unknown;',
      'shared/sim/det-math.d.ts': 'export declare function detSin(value: number): number;',
    },
    sources: { 'game.ts': "import {detSin} from '../../shared/sim/det-math.ts'; export const value = detSin(0.5);" },
  };
  expect(typecheckDeliverySources(input)).toMatchObject({ ok: true });
  expect(
    typecheckDeliverySources({
      ...input,
      sources: { 'game.ts': input.sources['game.ts'].replace('detSin(0.5)', 'detSin("invalid")') },
    }),
  ).toMatchObject({ ok: false });
});
