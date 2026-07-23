/**
 * A generated game: real, unconstrained source — not a schema-validated document.
 * html/css/js are assembled into one self-contained document by the caller and
 * run in a sandboxed iframe (no allow-same-origin), since arbitrary code can't
 * be safety-checked the way structured data can — sandboxing is what makes it safe.
 */
export interface GameProject {
  title: string;
  description: string;
  html: string;
  js: string;
  css: string;
}

/**
 * A GameGenerator turns a natural-language prompt into a GameProject.
 * Implementations may be a deterministic mock (this slice) or, later, a real
 * agentic coding CLI (Claude Code, Codex) run against a template repo.
 */
export interface GameGenerator {
  readonly name: string;
  generate(prompt: string): Promise<GameProject>;
}
