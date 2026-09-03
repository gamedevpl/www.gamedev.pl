# Ink vs the interactive host

Tried (Wave C): a compiled single-file binary plus Ink. **No-go then** because that
pairing was Node SEA / bun-compile + Ink's reconciler, raw-mode stdin, and `SIGWINCH`.
The shipped file is a Node 20 shebang script, so that pairing is gone.

**Ink is in.** esbuild bundles Ink and `yoga-layout` into one shebang file
(`dist/gamedevpl.mjs`). The bundle aliases `react-devtools-core` to an empty
module and uses a `createRequire` banner so CJS bits inside Ink load.

The REPL is Ink: `ReplApp` maps the last `rows-7` transcript lines (not `<Static>`), a
boxed composer, and an arrow-key picker for refine choices. Verbs and pipes stay
non-Ink. `status --watch` still uses `src/live.ts` (a few rows, not a dashboard).
Glyphs stay in `src/renderer.ts`.
