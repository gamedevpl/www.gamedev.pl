# @gamedevpl/game-generator

Turns a natural-language prompt into a **`GameProject`** — real, unconstrained game
source (`html` + `js` + `css`), not a schema-validated document. The caller
assembles the three parts into one self-contained page and runs it in a sandboxed
iframe (no `allow-same-origin`), because arbitrary generated code can't be
safety-checked the way structured data can — sandboxing is what makes it safe to run.

## The seam

```ts
export interface GameProject {
  title: string;
  description: string;
  html: string;
  js: string;
  css: string;
}

export interface GameGenerator {
  readonly name: string;
  generate(prompt: string): Promise<GameProject>;
}
```

The interface supports the local preview. Production creation no longer swaps in a real-time
generator: games are maintained in a dedicated repository and published as static bundles.

## `MockGameGenerator`

This slice ships one implementation: `MockGameGenerator` — **deterministic and
offline**, no API key, no network. It:

1. keyword-matches the lowercased prompt to one of three templates
   (`collect` / `space` / `dodge`, defaulting to `dodge`);
2. loads that template's `index.html`, `game.js`, and `style.css` from
   `templates/<name>/` on disk (resolved relative to the module via
   `import.meta.url`, so it works both compiled from `dist/` and under vitest
   from `src/`);
3. derives a title from the prompt and substitutes the `__TITLE__` /
   `__DESCRIPTION__` placeholders.

Each template is a genuinely-playable vanilla-JS canvas mini-game (arrow-key
movement, collision, score, win/lose overlay). The mock exists so the whole
prompt → game → play loop runs locally with zero external dependencies — proving
the loop before spending on model calls.

## Production role

The templates are intended to seed the dedicated games repository and keep the local player
surface exercisable until the catalog lands. Do not add a container or hosted-agent
`GameGenerator`: the removed self-hosted generation architecture is not a future extension
point. See [`docs/games-repo.md`](../../docs/games-repo.md).
