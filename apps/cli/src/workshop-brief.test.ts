import { expect, it } from 'vitest';
import { workshopBrief } from './workshop-brief.js';
it('writes a brief that names the game and forbids publishing', () => {
  const brief = workshopBrief('airtime', 'add a boss');
  expect(brief).toContain('"airtime"');
  expect(brief).toContain('add a boss');
  expect(brief).not.toContain('Studio understood');
  expect(brief).toMatch(/Do not run git/);
});

it('separates browser verification from implementation and bounds temporary tooling setup', () => {
  const brief = workshopBrief('airtime', 'add 3D ramps');
  expect(brief).toContain('Missing browser access blocks visual verification, not implementation');
  expect(brief).toContain('Complete all unblocked work');
  expect(brief).toContain('isolated temporary directory/cache, outside the game project');
  expect(brief).toContain('Do not change project dependencies or lockfiles');
  expect(brief).toContain('Do not install global packages, change sandbox permissions, or bypass a denied operation');
  expect(brief).toContain('Never claim screenshots or visual verification you did not perform');
  expect(brief).toContain('task consisting only of browser interaction or screenshots');
  expect(brief).not.toContain('report that limitation and finish');
});
