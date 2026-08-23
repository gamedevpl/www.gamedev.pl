// Regression cover: a deleted scaffold path silently emptied every seed prompt.
import { describe, expect, it } from 'vitest';
import { buildGeneratePrompt } from './creation/game-seed.js';
import { SEED_SCAFFOLD_SLUG, buildSeedContext, type SeedFileIndex } from './creation/seed-context.js';

function indexOf(files: Record<string, string>): SeedFileIndex {
  return { paths: Object.keys(files), read: (path) => files[path] ?? null };
}

const CATALOG = JSON.stringify([
  { slug: SEED_SCAFFOLD_SLUG, title: 'Block Cascade', genre: 'puzzle', status: 'published' },
  { slug: 'word-forge', title: 'Word Forge', genre: 'word puzzle', status: 'published' },
]);

const FILES: Record<string, string> = {
  'catalog.json': CATALOG,
  [`games/${SEED_SCAFFOLD_SLUG}/SPEC.md`]: '---\ntitle: Block Cascade\n---\n',
  [`games/${SEED_SCAFFOLD_SLUG}/game.ts`]: "import { startGame } from './game/runtime.ts';\n",
  [`games/${SEED_SCAFFOLD_SLUG}/game/runtime.ts`]: 'export function startGame() {}\n',
  'games/word-forge/SPEC.md': '---\ntitle: Word Forge\n---\n',
  'games/word-forge/game.ts': 'export {};\n',
};

const PROMPT_BASE = {
  slug: 'my-game',
  title: 'My Game',
  spec: 'A co-op party game.',
  references: '--- games/other/game.ts ---\nexport {};',
};

describe('seed scaffold', () => {
  it('renders the scaffold game under a placeholder slug', () => {
    const context = buildSeedContext(indexOf(FILES))!;

    expect(context.scaffold).toContain('--- games/<slug>/game.ts ---');
    expect(context.scaffold).toContain('--- games/<slug>/game/runtime.ts ---');
  });

  // The archive filter must keep the scaffold game.
  it('resolves a non-empty scaffold from a realistic archive', () => {
    expect(buildSeedContext(indexOf(FILES))!.scaffold.length).toBeGreaterThan(0);
  });

  it('reports an empty scaffold rather than pretending it rendered', () => {
    const withoutScaffold = Object.fromEntries(
      Object.entries(FILES).filter(([path]) => !path.startsWith(`games/${SEED_SCAFFOLD_SLUG}/`)),
    );

    expect(buildSeedContext(indexOf(withoutScaffold))!.scaffold).toBe('');
  });

  // Same gate as references: a withdrawn game cannot shape drafts.
  it('renders no scaffold when the scaffold game is not published', () => {
    const archived = {
      ...FILES,
      'catalog.json': JSON.stringify([
        { slug: SEED_SCAFFOLD_SLUG, title: 'Block Cascade', genre: 'puzzle', status: 'archived' },
        { slug: 'word-forge', title: 'Word Forge', genre: 'word puzzle', status: 'published' },
      ]),
    };

    expect(buildSeedContext(indexOf(archived))!.scaffold).toBe('');
  });

  it('omits the file-shape section entirely when there is no scaffold', () => {
    const withScaffold = buildGeneratePrompt({
      ...PROMPT_BASE,
      scaffold: '--- games/<slug>/game.ts ---\nexport {};',
    });
    expect(withScaffold).toContain('=== FILE SHAPE');

    const withoutScaffold = buildGeneratePrompt({ ...PROMPT_BASE, scaffold: '' });
    expect(withoutScaffold).not.toContain('=== FILE SHAPE');
    expect(withoutScaffold).toContain('=== REFERENCE GAMES (full source) ===');
  });

  // A real game, not placeholder gameplay.
  it('tells the model the scaffold is structure, not the game to build', () => {
    const prompt = buildGeneratePrompt({
      ...PROMPT_BASE,
      scaffold: '--- games/<slug>/game.ts ---\nexport {};',
    });

    expect(prompt).toContain('not the game to build');
    expect(prompt).toContain('never its mechanics, theme, or objective');
  });
});
