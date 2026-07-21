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

Any implementation is a `GameGenerator`. Callers depend only on this interface, so
the mock and a future real generator are swappable without touching consumers.

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

## Extension point: a real agentic generator (future)

The real generator will not fill in a fixed template. It will implement the same
`GameGenerator` interface but **shell out to an agentic coding CLI** (Claude Code /
Codex) running in a **sandboxed container** against a starter template repo. The
agent iterates on real files and produces a richer, multi-file project, which is
then collapsed into the `GameProject` shape (or the shape is widened later) and run
in the same sandboxed iframe. No output is ever trusted enough to run
un-sandboxed.

### Licensing note (check before building the cost model)

Running those CLIs under **individual Pro/Max subscriptions** as multi-tenant SaaS
backend compute — and **rotating across multiple accounts** to spread load — is a
licensing / Terms-of-Service question, not just an engineering one. It needs a
direct check with the vendor before any cost model is built on top of it. Assume
per-seat/interactive terms until confirmed otherwise; the compliant path may be a
metered API / commercial tier rather than subscription seats.
