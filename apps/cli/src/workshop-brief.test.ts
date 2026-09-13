import { expect, it } from 'vitest';
import { workshopBrief } from './workshop-brief.js';
it('writes a brief that names the game and forbids publishing', () => {
  const brief = workshopBrief('airtime', 'add a boss');
  expect(brief).toContain('"airtime"');
  expect(brief).toContain('add a boss');
  expect(brief).not.toContain('Studio understood');
  expect(brief).toMatch(/Do not run git/);
});
