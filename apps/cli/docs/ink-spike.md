# Ink vs the interactive host

Tried (Wave C): a compiled single-file binary plus Ink (React for terminals). **No-go then**
because that pairing was Node SEA / bun-compile + Ink's reconciler, raw-mode stdin, and
`SIGWINCH`. That constraint is gone — the shipped file is a Node 20 shebang script.

**Still not Ink in this tree.** The installer is one esbuild file with `dependencies: {}`.
Ink pulls React and yoga (native or wasm). Bundling yoga into the shebang asset is the
next trap; taking Ink without bundling it splits npm-run vs installer into two TUIs.

**Go, and do not grow past this:**

1. **Sentence prompt** — `node:readline/promises` behind `PromptHost` (`src/host.ts`).
   Readline is the line editor (history, POSIX). Do not replace it with Ink `useInput`.
2. **Live region** — `src/live.ts` paints at most a handful of rows (`status --watch`).
   It is a cursor-up redraw, not a widget kit. No menus, pickers, or layouts here.
3. **Verbs** — the same functions the REPL calls, so a pipe never blocks on a prompt.

Need a real TUI (pickers, dashboards)? Take Ink and change the installer to a directory
that can ship yoga. Do not extend `live.ts` into that. Glyphs stay in `src/renderer.ts`.
