import { describe, expect, it } from 'vitest';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import type { KitTree } from '../agent-surface/kit-files.js';
import { languageKitSources, studioKitFromTree } from './language-kit-sources.js';

function kitTree(files: Record<string, string>): KitTree {
  const map = new Map<string, Buffer>();
  for (const [rel, body] of Object.entries(files)) {
    map.set(`${KIT_ROOT_DIR}/${rel}`, Buffer.from(body, 'utf8'));
  }
  return { engineRef: 'abc', sha256: 'a'.repeat(64), files: map };
}

describe('languageKitSources', () => {
  it('keeps editor-def and sim, drops GameKit modules and the ambient dts', () => {
    const files = languageKitSources({
      'shared/game-kit.d.ts': 'declare const GameKit: unknown;\n',
      'shared/editor-def.ts': 'export function defineEditor() {}\n',
      'shared/sim/box-world.ts': 'export const box = 1;\n',
      'shared/sim-math.ts': 'export const tau = 6;\n',
      'shared/modules/core.ts': 'export const core = 1;\n',
      'shared/verticals/racing/index.ts': 'export const racing = 1;\n',
      'shared/genres/platformer.d.ts': 'declare function play(): void;\n',
    });
    expect(Object.keys(files).sort()).toEqual([
      'shared/editor-def.ts',
      'shared/sim-math.ts',
      'shared/sim/box-world.ts',
    ]);
  });
});

describe('studioKitFromTree', () => {
  it('splits the ambient dts from importable kit sources', () => {
    const kit = studioKitFromTree(
      kitTree({
        'shared/game-kit.d.ts': 'declare const GameKit: unknown;\n',
        'shared/editor-def.ts': 'export function defineEditor() {}\n',
        'shared/modules/core.ts': 'export const core = 1;\n',
      }),
    );
    expect(kit.declaration).toBe('declare const GameKit: unknown;\n');
    expect(kit.files).toEqual({ 'shared/editor-def.ts': 'export function defineEditor() {}\n' });
  });
});
