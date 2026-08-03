import { describe, expect, it } from 'vitest';
import { typeCheckGame } from './type-check.js';

/*
 * The gate exists for one reason: esbuild transpiles TypeScript without checking
 * it, so an edit that names a property nothing declares becomes a document that
 * assembles and then fails the player. These are the shapes that actually
 * occurred on the bench, not invented ones.
 */

const KIT = `
interface GameKitDraw {
  circle(x: number, y: number, r: number, style?: { fill?: string }): void;
}
interface GameKitGameContext {
  draw: GameKitDraw;
  width: number;
  height: number;
}
declare const GameKit: { defineGame(): unknown };
`;

const MODEL = `export type Round = {
  seedsLeft: number;
};

export function createRound(): Round {
  return { seedsLeft: 3 };
}
`;

const render = (body: string) => `import type { Round } from './model.ts';

export function paintWorld(round: Round, kit: GameKitGameContext) {
  ${body}
}
`;

describe('type check', () => {
  it('passes a game that is consistent with itself', () => {
    const result = typeCheckGame(
      { 'game/model.ts': MODEL, 'game/render.ts': render('kit.draw.circle(0, 0, round.seedsLeft);') },
      KIT,
    );
    expect(result.ok).toBe(true);
  });

  it("catches a field the game's own type does not declare", () => {
    // The "best combo: xNaN" shape: the edit writes to a field createRound never
    // populates, so at runtime it is undefined and the arithmetic is NaN.
    const result = typeCheckGame(
      { 'game/model.ts': MODEL, 'game/render.ts': render('kit.draw.circle(0, 0, round.combo);') },
      KIT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("Property 'combo' does not exist on type 'Round'");
  });

  it('catches a property invented on GameKit, and says what was available instead', () => {
    // The "invisible seeds" shape: `kit.time` does not exist, so the radius is
    // NaN and the canvas draws nothing at all — silently.
    const result = typeCheckGame(
      { 'game/model.ts': MODEL, 'game/render.ts': render('kit.draw.circle(0, 0, Math.sin(kit.time));') },
      KIT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("Property 'time' does not exist on type 'GameKitGameContext'");
    // The whole point of the enrichment: a repair round that is told only what
    // is wrong can just guess again.
    expect(result.errors[0]).toContain('available: draw, height, width');
  });

  it('stands down when there is no kit declaration to check against', () => {
    // Without the kit every GameKit call is an error, so a missing declaration
    // must mean "cannot check" and not "everything is broken".
    expect(typeCheckGame({ 'game/render.ts': render('kit.draw.circle(0, 0, 1);') }, null).ok).toBe(true);
  });

  it('does not report problems in the kit declaration itself', () => {
    // The engine's own file is not this edit's business, and a player must never
    // be blocked by it.
    const result = typeCheckGame({ 'game/model.ts': MODEL }, `${KIT}\nconst broken: number = 'no';\n`);
    expect(result.ok).toBe(true);
  });

  it('ignores non-TypeScript files the game carries', () => {
    const result = typeCheckGame({ 'game/model.ts': MODEL, 'index.html': '<!doctype html>' }, KIT);
    expect(result.ok).toBe(true);
  });
});
