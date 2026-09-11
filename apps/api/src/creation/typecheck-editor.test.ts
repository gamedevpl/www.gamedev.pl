import { describe, expect, it } from 'vitest';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import type { KitTree } from '../agent-surface/kit-files.js';
import { sharedSourcesFromKitTree, typecheckDeliverySources } from './typecheck-preflight.js';

const KIT_DTS = `
interface GameKitGameContext {
  draw: { circle(x: number, y: number, r: number): void };
  width: number;
  height: number;
}
declare const GameKit: { defineGame(): unknown };
`;

function kitTree(files: Record<string, string>): KitTree {
  const map = new Map<string, Buffer>();
  for (const [rel, body] of Object.entries(files)) {
    map.set(`${KIT_ROOT_DIR}/${rel}`, Buffer.from(body, 'utf8'));
  }
  return { engineRef: 'abc', sha256: 'a'.repeat(64), files: map };
}

describe('editor Kit preflight', () => {
  it('checks editor imports against the pinned Kit, including missing exports and files', () => {
    const kitShared = sharedSourcesFromKitTree(
      kitTree({
        'shared/game-kit.d.ts': KIT_DTS,
        'shared/editor-def.ts': 'export function defineEditor(value: number) { return value; }',
      }),
    );
    const check = (name: string, file: string) =>
      typecheckDeliverySources({
        slug: 'comet',
        kitShared,
        sources: { 'EDITOR.ts': `import { ${name} } from '../../shared/${file}.ts'; export default ${name}(1);` },
      });
    expect(check('defineEditor', 'editor-def').ok).toBe(true);
    expect(check('missingExport', 'editor-def').ok).toBe(false);
    expect(check('defineEditor', 'missing-file').ok).toBe(false);
  });
});
