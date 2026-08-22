import { describe, expect, it } from 'vitest';
import type { GameProject } from './game-project.js';

describe('GameProject', () => {
  it('carries the three source parts the assembler needs', () => {
    const project: GameProject = {
      title: 'Dodge',
      description: 'Avoid the rocks.',
      html: '<canvas id="game"></canvas>',
      js: 'start();',
      css: 'canvas { display: block; }',
    };
    expect(Object.keys(project).sort()).toEqual(['css', 'description', 'html', 'js', 'title']);
  });
});
