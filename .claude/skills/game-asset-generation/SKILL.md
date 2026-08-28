---
name: game-asset-generation
description: How game assets (sprites, audio, UI) are produced for gamedev.pl games — the procedural-drawing and shared-audio-catalog model, and the rules that constrain it. Use when planning or reviewing asset work for games in the games repo.
---

# Game Asset Generation

Orientation for coding agents working on assets for `gamedev.pl` games.

> **The canonical, authoritative guidance lives in the games repo** (`www.gamedev.pl-games`),
> not here: `.github/skills/develop-canvas-game`, `.github/skills/develop-scene3d-game`, and
> `.github/skills/develop-game-audio`, plus `.github/copilot-instructions.md` and
> `references/game-kit.md`. When this file and those disagree, **those win** — they sit next
> to the validator that enforces them. Use this file to understand the model and its
> constraints; use those to actually build.

---

## The model in one paragraph

Games ship as a **single self-contained HTML document** rendered in a sandboxed iframe with
`default-src 'none'` CSP and no network access. Graphics are **drawn procedurally in code**
— there are no bitmap assets in any shipped game. Audio comes from a **shared, pre-rendered
catalog** that every game selects from by default; sound effects are always shared-catalog
only, and a game may ship a custom-scored optional per-game `music.json` beside `GAME.json`
for its own tracker music. Both rules are enforced by `npm run validate` in the games repo,
not left to taste.

## Hard rules

1. **No runtime network, ever.** No `fetch`, `XMLHttpRequest`, `<script src>`, `<link>`,
   `@import`, remote fonts or images. Builds must work offline once assembled.
2. **Never `ctx` / `getContext` / GLSL inside a game.** Canvas entry is always
   `GameKit.createRenderer` (`gfx` module); you paint only through the returned `draw`
   surface (`clear`, `rect`, `circle`, `text`, `with`, `panel`, `overlay`, `actor`). 3D goes
   through `GameKit.createScene3dGame` (`gfx3d`). Enforced by validate Check 3 and
   `npm run check:gfx`.
3. **Never hand-roll `new AudioContext()` or oscillators in game code.** All audio goes
   through the `audio` module (`GameKit.createAudio`). Enforced by validate Checks 9 and 17.
4. **Byte budget is real.** ~936 KiB author budget per game (`authorBudgetBytes` in
   `shared/assemble-contract.json`, mirrored in `tools/validate.ts`'s `GAME_BUDGET_BYTES`),
   plus a 410 KB platform/GameKit reserve not billed to the author (`GAMEKIT_PLATFORM_BYTES`)
   — contract-locked across two repos. Assets are not free, but the ceiling is far higher
   than the old "200 KiB" figure this line used to give; verify against `tools/validate.ts`
   before assuming a feature won't fit.
5. **Reference art packs are study-only.** `references/packs/` (CC0 Kenney/itch material)
   must never be shipped into a bundle or inlined as `data:image` — validate Checks 15/16.

## Graphics: procedural, pre-rendered at boot

Draw sprites once into offscreen surfaces at boot rather than re-drawing per frame, then
blit. Express the drawing through the `draw` surface — the renderer owns the canvas.

Practical guidance that survives the rules:

- **Harmonious palettes.** Cohesive schemes (PICO-8 16-colour, a tailored HSL ramp), never
  raw primary red/green/blue.
- **Fixed virtual resolution**, letterboxed via `object-fit: contain`; `image-rendering:
  pixelated` for pixel-art looks.
- **Screen juice.** Camera shake on impact, particle bursts on destruction, floating score
  popups. This is where perceived asset quality actually comes from.
- Study `references/visual-lineage.md` and keep `games/<slug>/VISUAL.md` current when
  polishing visuals.

## Audio: select from the shared catalog

Two data-driven catalogs in the games repo, both rendered/validated by `tools/audio.ts`:

- **`shared/audio/sounds.json`** — synth patches (`duration`, `voices[]` of
  `sine`/`square`/`triangle`/`saw`/`noise` with `from`/`to`/`gain`/`attack`/`release`).
  `npm run audio` renders these to `shared/audio/assets/*.wav`; `npm run audio:check`
  **byte-compares** the committed WAVs against a fresh render and fails CI on drift, so
  catalog edits and regenerated WAVs must be committed together.
- **`shared/audio/music.json`** — tracker-style looping tracks (`bpm`, `steps`, up to four
  channels). Data only, no WAV render. All moods together cost under 8 KB, which is why
  music is patterns rather than recordings.

A game that needs a score the shared moods don't cover may ship its own optional
`music.json` beside `GAME.json` (same `{ version, tracks }` shape). Assemble merges it onto
the shared catalog; a per-game track name that collides with a shared id is refused. This
applies to **music only** — sound effects always come from the shared `sounds.json` catalog,
no per-game exception exists there. Prefer a shared mood when one fits; see
`develop-game-audio` in the games repo and `byoca-mcp`'s "Custom music" section for the
self-build-agent path.

Reuse an existing semantic sound before adding a patch. Keep effects under a second, gains
conservative. Select only the sounds a game uses, always include `ui-toggle`, and pick one
music track:

```ts
const audio = GameKit.createAudio({ volume: 0.7 });
audio.playMusic();
audio.play('coin');
```

⚠️ **Adding a synth patch: append it at the end of `sounds.json`.** The renderer seeds its
noise generator from each sound's *positional index*, so inserting an entry mid-catalog
silently restales every later noise-using WAV.

See `develop-game-audio` in the games repo for sound-design guidance, the mood table, mute
behaviour, and where to trigger cues.

## What this skill used to say, and why it changed

Earlier revisions told agents to call `getContext('2d')`, hand-roll `new AudioContext()`
oscillators inside game code, avoid external `.wav`/`.mp3` entirely, and reach for a
`generate_image` tool. All four were wrong: the first two are banned by the validator, the
third misdescribes a platform that ships a pre-rendered WAV catalog, and no `generate_image`
tool exists in any of the three repos.

AI-generated audio is being planned as a **curated, build-time** addition to the shared
catalog — never something a game fetches at runtime, and not something an agent generates
on demand. Until that ships, the catalogs above are the whole audio story.
