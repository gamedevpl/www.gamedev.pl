# Ink spike (CL-16a)

Tried: a compiled single-file binary plus Ink (React for terminals).

**No-go for this tree.** The load-bearing design is the two-region renderer (append-only
transcript + ≤4-row live region), not the framework. Ink's reconciler, raw-mode stdin,
and `SIGWINCH` under a Node SEA / bun-compiled binary is the pairing the spike was meant
to prove; this environment cannot exercise macOS Keychain, Windows ConPTY, and a real
SEA in one pass.

**Go: custom renderer** in `src/renderer.ts` — same glyphs (`◆` / `›`), `NO_COLOR`
downgrade, width-aware live truncation, transcript never rewritten. Verbs (CL-30) are the
same functions the REPL calls, so a pipe never blocks on a prompt.

If Ink is revisited, re-run this spike on darwin-arm64, linux-x64, and Windows Terminal
before replacing `renderer.ts`.
