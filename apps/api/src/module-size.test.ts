import { describe, expect, it } from 'vitest';
import {
  assessModuleSize,
  isGameTsModule,
  largeSourceFileHint,
  MODULE_SOFT_LIMIT_BYTES,
  MODULE_SOFT_LIMIT_LINES,
  moduleSizeWarnings,
  moduleTooLargeMessage,
} from './module-size.js';

describe('module-size budget', () => {
  it('treats game/*.ts as modules but not game.ts', () => {
    expect(isGameTsModule('game/render.ts')).toBe(true);
    expect(isGameTsModule('game.ts')).toBe(false);
    expect(isGameTsModule('SPEC.md')).toBe(false);
  });

  it('flags modules past the soft line or byte ceiling', () => {
    const byLines = assessModuleSize('game/render.ts', `${'x\n'.repeat(MODULE_SOFT_LIMIT_LINES)}`);
    expect(byLines.oversize).toBe(true);
    expect(byLines.lines).toBeGreaterThanOrEqual(MODULE_SOFT_LIMIT_LINES);

    const under = assessModuleSize('game/render.ts', 'export const x = 1;\n');
    expect(under.oversize).toBe(false);

    const byBytes = assessModuleSize('game/model.ts', 'a'.repeat(MODULE_SOFT_LIMIT_BYTES));
    expect(byBytes.oversize).toBe(true);
  });

  it('names a concrete split recipe for render/model', () => {
    const render = moduleTooLargeMessage({
      path: 'game/render.ts',
      bytes: 20_000,
      lines: 500,
      oversize: true,
    });
    expect(render).toMatch(/game\/art\.ts|game\/ui\.ts|game\/hud\.ts/);
    expect(render).toMatch(/Before adding more behavior/);
    expect(render).toMatch(/patch_source_file\(\{ path, old, new \}\)/);

    const model = moduleTooLargeMessage({
      path: 'game/model.ts',
      bytes: 20_000,
      lines: 500,
      oversize: true,
    });
    expect(model).toMatch(/tables|layout|types/);
  });

  it('returns capped warnings for a file list', () => {
    const big = 'x\n'.repeat(MODULE_SOFT_LIMIT_LINES + 10);
    const warnings = moduleSizeWarnings([
      { path: 'game/render.ts', content: big },
      { path: 'game/model.ts', content: big },
      { path: 'game/runtime.ts', content: big },
      { path: 'game/a.ts', content: big },
      { path: 'game/b.ts', content: big },
      { path: 'game.ts', content: big },
      { path: 'SPEC.md', content: big },
    ]);
    expect(warnings).toHaveLength(4);
    expect(warnings.every((w) => w.code === 'module_too_large')).toBe(true);
    expect(warnings.some((w) => w.message.includes('game.ts'))).toBe(false);
  });

  it('largeSourceFileHint stays quiet under the ceiling', () => {
    expect(largeSourceFileHint('game/render.ts', MODULE_SOFT_LIMIT_BYTES - 1, 'ok\n')).toBeNull();
  });
});
