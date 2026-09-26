// No-network policy for unreviewed game documents; valid in a meta tag.
export const GAME_PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  'img-src data: blob:; media-src data: blob:; font-src data:; ' +
  "connect-src 'none'; form-action 'none'; base-uri 'none'";

// Header form adds sandbox, which a meta CSP cannot carry.
export const GAME_PREVIEW_CSP_HEADER = `sandbox allow-scripts allow-pointer-lock; ${GAME_PREVIEW_CSP}`;

const GAME_PREVIEW_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${GAME_PREVIEW_CSP}">`;

// Leading whitespace (\s includes a BOM) and comments, then the doctype.
const LEADING_DOCTYPE = /^(?:\s|<!--[\s\S]*?-->)*<!doctype\b[^>]*>/i;

// Puts the policy ahead of all of the document's own markup.
export function withGamePreviewCsp(html: string): string {
  // Matching <head> is unsafe: markup before it opens an implied head.
  const doctype = LEADING_DOCTYPE.exec(html);
  if (doctype) {
    const end = doctype[0].length;
    return `${html.slice(0, end)}${GAME_PREVIEW_CSP_META}${html.slice(end)}`;
  }
  // Prepending keeps a doctype-less document in the quirks mode it had.
  return `${GAME_PREVIEW_CSP_META}${html}`;
}
