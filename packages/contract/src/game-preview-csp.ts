// No-network policy for unreviewed game documents; valid in a meta tag.
export const GAME_PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  'img-src data: blob:; media-src data: blob:; font-src data:; ' +
  "connect-src 'none'; form-action 'none'; base-uri 'none'";

// Header form adds sandbox, which a meta CSP cannot carry.
export const GAME_PREVIEW_CSP_HEADER = `sandbox allow-scripts allow-pointer-lock; ${GAME_PREVIEW_CSP}`;

const GAME_PREVIEW_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${GAME_PREVIEW_CSP}">`;

const WHITESPACE = /\s/;

// End of a leading doctype after whitespace, BOM and comments; linear scan.
function leadingDoctypeEnd(html: string): number {
  let i = 0;
  while (i < html.length) {
    if (WHITESPACE.test(html[i])) {
      i += 1;
    } else if (html.startsWith('<!--', i)) {
      const close = html.indexOf('-->', i + 4);
      if (close < 0) return -1;
      i = close + 3;
    } else {
      break;
    }
  }
  if (html.slice(i, i + 9).toLowerCase() !== '<!doctype') return -1;
  const end = html.indexOf('>', i + 9);
  return end < 0 ? -1 : end + 1;
}

// Puts the policy ahead of all of the document's own markup.
export function withGamePreviewCsp(html: string): string {
  // Matching <head> is unsafe: markup before it opens an implied head.
  const end = leadingDoctypeEnd(html);
  if (end > 0) {
    return `${html.slice(0, end)}${GAME_PREVIEW_CSP_META}${html.slice(end)}`;
  }
  // Prepending keeps a doctype-less document in the quirks mode it had.
  return `${GAME_PREVIEW_CSP_META}${html}`;
}
