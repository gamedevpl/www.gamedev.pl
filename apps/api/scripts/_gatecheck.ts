import { readFile } from 'node:fs/promises';
import { typeCheckGame } from '../src/type-check.js';

async function main() {
  const kit = await readFile('/Users/gtanczyk/src/www.gamedev.pl-games/shared/game-kit.d.ts', 'utf8');
  const cases: Record<string, string> = {
    'destructure unknown kit member': 'export function f() { const { clamp, createComboChain } = GameKit; return [clamp, createComboChain]; }',
    'call unknown kit member': 'export function f() { return GameKit.createComboChain({}); }',
    'known kit member (control)': 'export function f() { return GameKit.clamp(1, 0, 2); }',
    'unknown member on a game type': 'type R = { a: number }; export function f(r: R) { return r.b; }',
  };
  for (const [name, src] of Object.entries(cases)) {
    const r = typeCheckGame({ 'game/x.ts': src }, kit);
    console.log((r.ok ? 'PASSES  ' : 'CAUGHT  ') + name);
    if (!r.ok) console.log('          ' + r.errors[0].slice(0, 160));
  }
}
main();
