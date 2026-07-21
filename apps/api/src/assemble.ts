import type { GameProject } from '@gamedevpl/game-generator';

/** Combined html+js+css size cap. Generated code is served, not stored, so keep it modest. */
export const MAX_PROJECT_BYTES = 200 * 1024;

export class ProjectTooLargeError extends Error {}
export class EmptyProjectError extends Error {}

/**
 * Assembles a GameProject into one self-contained HTML document for iframe srcdoc.
 * The document runs in a sandboxed iframe (no allow-same-origin) on the client, so
 * we don't sanitize the code — isolation, not inspection, is the safety boundary.
 * We only enforce basic hygiene: non-empty markup/logic and a size cap.
 */
export function assembleGameHtml(project: GameProject): string {
  if (!project.html.trim() || !project.js.trim()) {
    throw new EmptyProjectError('generated project is missing html or js');
  }

  const totalBytes = Buffer.byteLength(project.html + project.js + project.css, 'utf8');
  if (totalBytes > MAX_PROJECT_BYTES) {
    throw new ProjectTooLargeError(`generated project is ${totalBytes} bytes, over the ${MAX_PROJECT_BYTES} cap`);
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(project.title)}</title>
    <style>${project.css}</style>
  </head>
  <body>
${project.html}
    <script>${project.js}</script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
